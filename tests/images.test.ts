import { describe, expect, it } from "vitest";
import { encode, decode } from "fast-png";
import { validateUpload, makeCutout } from "../src/server/images";
import { deflateSync } from "node:zlib";

function chunk(type: string, data: Uint8Array) {
  const bytes = Buffer.alloc(data.length + 12);
  bytes.writeUInt32BE(data.length);
  bytes.write(type, 4);
  bytes.set(data, 8);
  let crc = 0xffffffff;
  for (const byte of bytes.subarray(4, -4)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  bytes.writeUInt32BE((crc ^ 0xffffffff) >>> 0, bytes.length - 4);
  return bytes;
}
function fixture(
  width: number,
  height: number,
  depth: number,
  colorType: number,
  scanlines: Uint8Array,
  extra: Uint8Array[] = [],
) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = depth;
  header[9] = colorType;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    ...extra,
    chunk("IDAT", deflateSync(scanlines)),
    chunk("IEND", new Uint8Array()),
  ]);
}
const upload = (bytes: Uint8Array) =>
  validateUpload(
    "data:image/png;base64," + Buffer.from(bytes).toString("base64"),
  );
describe("safe drawing cutout", () => {
  it("removes only connected paper and preserves white inside a closed outline", () => {
    const data = new Uint8Array(9 * 9 * 4).fill(255);
    for (let y = 2; y <= 6; y++)
      for (let x = 2; x <= 6; x++)
        if (x === 2 || x === 6 || y === 2 || y === 6) {
          const i = (y * 9 + x) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
    const result = decode(
      makeCutout(encode({ width: 9, height: 9, channels: 4, data })),
    );
    const a = (x: number, y: number) =>
      result.data[(y * result.width + x) * 4 + 3];
    expect(a(0, 0)).toBe(0);
    expect(a(Math.floor(result.width / 2), Math.floor(result.height / 2))).toBe(
      255,
    );
  });
  it("rejects active content and image-shaped garbage", () => {
    for (const input of [
      "data:image/svg+xml;base64,PHN2Zz4=",
      "data:image/png;base64,aGVsbG8=",
    ])
      expect(() => validateUpload(input)).toThrow();
  });
  it("rejects declared image dimensions before allocating decoded memory", () => {
    const png = encode({
      width: 1,
      height: 1,
      channels: 4,
      data: new Uint8Array([1, 2, 3, 255]),
    });
    new DataView(png.buffer, png.byteOffset, png.byteLength).setUint32(
      16,
      90000,
    );
    expect(() =>
      validateUpload(
        "data:image/png;base64," + Buffer.from(png).toString("base64"),
      ),
    ).toThrow();
  });
  it("rejects a later IHDR which overrides the checked image dimensions", () => {
    const small = fixture(1, 1, 8, 6, new Uint8Array([0, 20, 30, 40, 255]));
    const large = fixture(2049, 1, 8, 6, new Uint8Array(1 + 2049 * 4));
    const duplicate = Buffer.concat([
      large.subarray(0, 8),
      small.subarray(8, 33),
      large.subarray(8),
    ]);
    expect(() => upload(duplicate)).toThrow();
  });
  it("rejects an oversized inflated stream even when IHDR and compressed bytes are tiny", () => {
    const bomb = fixture(1, 1, 8, 6, new Uint8Array(1024 * 1024));
    expect(bomb.length).toBeLessThan(2000);
    expect(() => upload(bomb)).toThrow();
  });
  it("discards compressed profiles and other ancillary metadata without decoding it", () => {
    const data = new Uint8Array([0, 30, 50, 90, 255]);
    const hugeProfile = Buffer.concat([
      Buffer.from("profile\0\0"),
      deflateSync(new Uint8Array(1024 * 1024)),
    ]);
    const invalidProfile = Buffer.from("profile\0\0not-valid-deflate");
    for (const profile of [hugeProfile, invalidProfile]) {
      const cleaned = decode(
        upload(
          fixture(1, 1, 8, 6, data, [
            chunk("iCCP", profile),
            chunk("tEXt", Buffer.from("Description\0private metadata")),
          ]),
        ),
      );
      expect(Array.from(cleaned.data)).toEqual([30, 50, 90, 255]);
      expect(cleaned.iccEmbeddedProfile).toBeUndefined();
      expect(cleaned.text).toEqual({});
    }
  });
  it("scales packed grayscale samples and keeps row padding out of pixels", () => {
    const result = decode(
      upload(
        fixture(3, 2, 1, 0, new Uint8Array([0, 0b10100000, 0, 0b01000000])),
      ),
    );
    expect(Array.from(result.data)).toEqual([
      255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255,
      255, 255, 255, 0, 0, 0, 255,
    ]);
  });
  it("preserves RGB color-key transparency and explicit alpha", () => {
    const key = Buffer.alloc(6);
    key.writeUInt16BE(20);
    key.writeUInt16BE(40, 2);
    key.writeUInt16BE(60, 4);
    const keyed = decode(
      upload(
        fixture(1, 1, 8, 2, new Uint8Array([0, 20, 40, 60]), [
          chunk("tRNS", key),
        ]),
      ),
    );
    expect(Array.from(keyed.data)).toEqual([20, 40, 60, 0]);
    const rgba = decode(
      upload(fixture(1, 1, 8, 6, new Uint8Array([0, 20, 40, 60, 77]))),
    );
    expect(Array.from(rgba.data)).toEqual([20, 40, 60, 77]);
  });
  it("preserves packed palette entries and their transparency", () => {
    const result = decode(
      upload(
        fixture(2, 1, 1, 3, new Uint8Array([0, 0b01000000]), [
          chunk("PLTE", new Uint8Array([40, 80, 120, 200, 160, 120])),
          chunk("tRNS", new Uint8Array([0, 255])),
        ]),
      ),
    );
    expect(Array.from(result.data)).toEqual([
      40, 80, 120, 0, 200, 160, 120, 255,
    ]);
  });
  it("ignores suggested palettes on truecolor images", () => {
    const result = decode(
      upload(
        fixture(1, 1, 8, 2, new Uint8Array([0, 20, 40, 60]), [
          chunk("PLTE", new Uint8Array([1, 2, 3])),
        ]),
      ),
    );
    expect(Array.from(result.data)).toEqual([20, 40, 60, 255]);
  });
  it("rejects excessive zero-length chunks before they accumulate decoder state", () => {
    const png = fixture(1, 1, 8, 6, new Uint8Array([0, 20, 30, 40, 255]));
    const excessive = Buffer.concat([
      png.subarray(0, 33),
      ...Array.from({ length: 1024 }, () => chunk("IDAT", new Uint8Array())),
      png.subarray(33),
    ]);
    expect(() => upload(excessive)).toThrow();
  });
  it("rejects truncated and CRC-corrupted PNG chunks", () => {
    const png = fixture(1, 1, 8, 6, new Uint8Array([0, 20, 30, 40, 255]));
    expect(() => upload(png.subarray(0, -1))).toThrow();
    png[png.length - 1] ^= 1;
    expect(() => upload(png)).toThrow();
  });
  it("reports unsupported interlace before decoding it", () => {
    const png = fixture(1, 1, 8, 6, new Uint8Array([0, 20, 30, 40, 255]));
    const header = png.subarray(16, 29);
    header[12] = 1;
    const interlaced = Buffer.concat([
      png.subarray(0, 8),
      chunk("IHDR", header),
      png.subarray(33),
    ]);
    expect(() => upload(interlaced)).toThrow(/non-interlaced/);
  });
});
