export function fitImage(width: number, height: number) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    throw new Error("This photo could not be opened. Choose another image.");
  const ratio = Math.min(1, 1024 / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}
export type Route =
  { kind: "owner" | "missing" } | { kind: "join" | "world"; id: string };
export function parseRoute(path: string): Route {
  if (path === "/") return { kind: "owner" };
  const match = /^\/(join|world)\/([A-Za-z0-9_-]+)\/?$/.exec(path);
  return match
    ? { kind: match[1] as "join" | "world", id: match[2] }
    : { kind: "missing" };
}
export function accessLink(
  origin: string,
  route: "join" | "world",
  id: string,
  token: string,
) {
  return `${origin}/${route}/${encodeURIComponent(id)}#${encodeURIComponent(token)}`;
}
export function safeAssetPath(path: string, id: string) {
  const prefix = `/api/worlds/${encodeURIComponent(id)}/assets/`;
  if (
    !path.startsWith(prefix) ||
    !/^[A-Za-z0-9_-]+$/.test(path.slice(prefix.length))
  )
    throw new Error("Character image unavailable.");
  return path;
}
export async function normalizePhoto(file: File): Promise<string> {
  if (
    ![
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
    ].includes(file.type)
  )
    throw new Error(
      "Choose a JPG, PNG, WebP, or a photo your browser can open.",
    );
  if (file.size > 25 * 1024 * 1024)
    throw new Error(
      "This photo is too large to open safely. Choose a smaller photo under 25 MB.",
    );
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const dimensions = fitImage(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    Object.assign(canvas, dimensions);
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error(
        "This browser cannot prepare your photo. Try a different browser.",
      );
    context.drawImage(img, 0, 0, dimensions.width, dimensions.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}
