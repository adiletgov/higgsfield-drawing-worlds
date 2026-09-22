import { decode, encode, hasPngSignature } from "fast-png";
import { Unzlib } from "fflate";
import jpeg from "jpeg-js";
import { HttpError } from "./security";
const MAX_PIXELS = 4_194_304;
const MAX_BYTES = 12 * 1024 * 1024;
function dimensions(width: number, height: number) {
  if (
    width < 1 ||
    height < 1 ||
    width > 2048 ||
    height > 2048 ||
    width * height > MAX_PIXELS
  )
    throw new HttpError(
      400,
      "Use a smaller drawing photo (up to 2048 pixels per side).",
    );
}

const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let bit = 0; bit < 8; bit++)
    n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function invalidPng(): never {
  throw new HttpError(400, "This PNG could not be read. Choose another photo.");
}

/** Validate compressed data before the decoder allocates from it. Ancillary data
 * never reaches fast-png: an embedded color profile can itself be a zip bomb. */
function boundedPng(bytes: Uint8Array): {
  bytes: Uint8Array;
  transparency?: Uint16Array;
} {
  if (bytes.length < 45) invalidPng();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kept: Uint8Array[] = [bytes.subarray(0, 8)];
  const idat: Uint8Array[] = [];
  let offset = 8,
    expected = 0,
    colorType = -1,
    bitDepth = 0,
    paletteEntries = 0,
    chunkCount = 0;
  let transparency: Uint16Array | undefined;
  let sawHeader = false,
    sawData = false,
    endedData = false,
    sawEnd = false,
    sawTransparency = false;
  while (offset < bytes.length) {
    if (++chunkCount > 1024) invalidPng();
    if (offset + 12 > bytes.length) invalidPng();
    const length = view.getUint32(offset),
      end = offset + 12 + length;
    if (end > bytes.length) invalidPng();
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (
      !/^[A-Za-z]{4}$/.test(type) ||
      crc32(bytes.subarray(offset + 4, end - 4)) !== view.getUint32(end - 4)
    )
      invalidPng();
    const data = bytes.subarray(offset + 8, end - 4);
    if (!sawHeader && type !== "IHDR") invalidPng();
    if (sawData && type !== "IDAT") endedData = true;
    switch (type) {
      case "IHDR": {
        if (sawHeader || offset !== 8 || length !== 13) invalidPng();
        sawHeader = true;
        const width = view.getUint32(offset + 8),
          height = view.getUint32(offset + 12);
        dimensions(width, height);
        bitDepth = data[8];
        colorType = data[9];
        const channels = (
          { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>
        )[colorType];
        const validDepth =
          colorType === 0
            ? [1, 2, 4, 8, 16]
            : colorType === 3
              ? [1, 2, 4, 8]
              : [8, 16];
        if (
          !channels ||
          !validDepth.includes(bitDepth) ||
          data[10] !== 0 ||
          data[11] !== 0
        )
          invalidPng();
        if (data[12] !== 0)
          throw new HttpError(
            400,
            "Choose a non-interlaced PNG or a new photo.",
          );
        expected = height * (1 + Math.ceil((width * channels * bitDepth) / 8));
        if (expected > MAX_PIXELS * 4 + 2048)
          throw new HttpError(400, "Choose a smaller image or an 8-bit PNG.");
        kept.push(bytes.subarray(offset, end));
        break;
      }
      case "PLTE":
        if (
          paletteEntries ||
          sawData ||
          colorType === 0 ||
          colorType === 4 ||
          length < 3 ||
          length > 768 ||
          length % 3 !== 0
        )
          invalidPng();
        paletteEntries = length / 3;
        if (colorType === 3 && paletteEntries > 2 ** bitDepth) invalidPng();
        if (colorType === 3) kept.push(bytes.subarray(offset, end));
        break;
      case "tRNS":
        if (
          sawTransparency ||
          sawData ||
          !(
            (colorType === 0 && length === 2) ||
            (colorType === 2 && length === 6) ||
            (colorType === 3 &&
              paletteEntries > 0 &&
              length > 0 &&
              length <= paletteEntries)
          )
        )
          invalidPng();
        sawTransparency = true;
        if (colorType === 3) kept.push(bytes.subarray(offset, end));
        else
          transparency = Uint16Array.from({ length: length / 2 }, (_, i) =>
            view.getUint16(offset + 8 + i * 2),
          );
        break;
      case "IDAT":
        if (endedData || (colorType === 3 && !paletteEntries)) invalidPng();
        sawData = true;
        idat.push(data);
        kept.push(bytes.subarray(offset, end));
        break;
      case "IEND":
        if (!sawData || length !== 0 || end !== bytes.length) invalidPng();
        sawEnd = true;
        kept.push(bytes.subarray(offset, end));
        break;
      default:
        // Ignore ancillary chunks without decompressing or interpreting them.
        // Unknown critical chunks and animations cannot be safely normalized.
        if (
          type[0] === type[0].toUpperCase() ||
          ["acTL", "fcTL", "fdAT"].includes(type)
        )
          invalidPng();
    }
    offset = end;
  }
  if (!sawEnd) invalidPng();
  let inflated = 0;
  const inflator = new Unzlib((chunk) => {
    inflated += chunk.length;
    if (inflated > expected) invalidPng();
  });
  // Small compressed slices bound the inflater's temporary allocation before
  // its callback can reject a stream larger than the declared pixel buffer.
  for (const data of idat)
    for (let i = 0; i < data.length; i += 256)
      inflator.push(data.subarray(i, i + 256), false);
  inflator.push(new Uint8Array(), true);
  if (inflated !== expected) invalidPng();
  const clean = new Uint8Array(
    kept.reduce((total, chunk) => total + chunk.length, 0),
  );
  offset = 0;
  for (const chunk of kept) {
    clean.set(chunk, offset);
    offset += chunk.length;
  }
  return { bytes: clean, transparency };
}
function decodeRgba(bytes: Uint8Array) {
  if (bytes.length > MAX_BYTES)
    throw new HttpError(400, "Choose a smaller image.");
  if (hasPngSignature(bytes)) {
    const safe = boundedPng(bytes),
      decoded = decode(safe.bytes, { checkCrc: true });
    const { width, height, channels, depth, data, palette } = decoded;
    const transparency = safe.transparency;
    dimensions(width, height);
    const rgba = new Uint8Array(width * height * 4);
    for (let p = 0; p < width * height; p++) {
      const i = p * channels,
        o = p * 4;
      const raw = (index: number) => {
        if (depth >= 8) return Number(data[index]);
        const row = Math.floor(p / width),
          column = p % width,
          stride = Math.ceil((width * depth) / 8);
        return (
          (Number(data[row * stride + Math.floor((column * depth) / 8)]) >>>
            (8 - depth - ((column * depth) % 8))) &
          ((1 << depth) - 1)
        );
      };
      const n = (index: number) =>
        Math.round((raw(index) * 255) / (2 ** depth - 1));
      if (palette) {
        const color = palette[raw(i)];
        if (!color) throw new Error("Bad palette");
        rgba.set([color[0], color[1], color[2], color[3] ?? 255], o);
      } else if (channels < 3) {
        rgba[o] = rgba[o + 1] = rgba[o + 2] = n(i);
        rgba[o + 3] =
          channels === 2 ? n(i + 1) : transparency?.[0] === raw(i) ? 0 : 255;
      } else {
        rgba[o] = n(i);
        rgba[o + 1] = n(i + 1);
        rgba[o + 2] = n(i + 2);
        rgba[o + 3] =
          channels === 4
            ? n(i + 3)
            : transparency &&
                transparency[0] === raw(i) &&
                transparency[1] === raw(i + 1) &&
                transparency[2] === raw(i + 2)
              ? 0
              : 255;
      }
    }
    return { width, height, data: rgba };
  }
  if (bytes[0] === 255 && bytes[1] === 216) {
    const decoded = jpeg.decode(bytes, {
      useTArray: true,
      formatAsRGBA: true,
      maxResolutionInMP: 4,
      maxMemoryUsageInMB: 48,
    });
    dimensions(decoded.width, decoded.height);
    return decoded;
  }
  throw new HttpError(400, "Choose a PNG or JPEG drawing.");
}
export function normalizeImage(bytes: Uint8Array): Uint8Array {
  const decoded = decodeRgba(bytes);
  return encode({ ...decoded, channels: 4, depth: 8 });
}
export function validateUpload(value: unknown): Uint8Array {
  if (
    typeof value !== "string" ||
    !value.startsWith("data:image/png;base64,") ||
    value.length > MAX_BYTES * 1.4
  )
    throw new HttpError(400, "Choose a supported drawing photo.");
  try {
    const bytes = Uint8Array.from(atob(value.slice(22)), (c) =>
      c.charCodeAt(0),
    );
    return normalizeImage(bytes);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      400,
      "This image could not be read. Choose another photo.",
    );
  }
}
export function makeCutout(bytes: Uint8Array): Uint8Array {
  const { width, height, data } = decodeRgba(bytes);
  const count = width * height,
    seen = new Uint8Array(count),
    queue = new Uint32Array(count);
  let head = 0,
    tail = 0;
  const enqueue = (p: number) => {
    if (seen[p]) return;
    seen[p] = 1;
    const o = p * 4;
    const min = Math.min(data[o], data[o + 1], data[o + 2]),
      max = Math.max(data[o], data[o + 1], data[o + 2]);
    if (data[o + 3] < 10 || (min > 230 && max - min < 28)) queue[tail++] = p;
  };
  for (let x = 0; x < width; x++) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  while (head < tail) {
    const p = queue[head++],
      x = p % width,
      y = Math.floor(p / width);
    data[p * 4 + 3] = 0;
    if (x > 0) enqueue(p - 1);
    if (x < width - 1) enqueue(p + 1);
    if (y > 0) enqueue(p - width);
    if (y < height - 1) enqueue(p + width);
  }
  let left = width,
    right = -1,
    top = height,
    bottom = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3] > 10) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
  if (right < left)
    throw new HttpError(
      422,
      "No character was found. Use a darker outline on plain paper.",
    );
  const padding = 2,
    w = right - left + 1 + padding * 2,
    h = bottom - top + 1 + padding * 2,
    cropped = new Uint8Array(w * h * 4);
  for (let y = top; y <= bottom; y++)
    cropped.set(
      data.subarray((y * width + left) * 4, (y * width + right + 1) * 4),
      ((y - top + padding) * w + padding) * 4,
    );
  return encode({ width: w, height: h, channels: 4, data: cropped });
}
