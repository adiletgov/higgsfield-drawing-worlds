export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export interface AuthEnv {
  OWNER_EMAIL?: string;
  ALLOW_LOCAL_OWNER?: string;
  DEMO_MODE?: string;
}
export function isLocal(request: Request) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(
    new URL(request.url).hostname,
  );
}
export function isOwner(request: Request, env: AuthEnv) {
  if (isLocal(request) && env.ALLOW_LOCAL_OWNER === "true") return true;
  // Production is intended for Sites, which supplies and sanitizes this identity header.
  // Alternate hosts MUST put this Worker behind a trusted identity proxy that strips client headers.
  const owner = env.OWNER_EMAIL?.trim().toLowerCase();
  return (
    !!owner &&
    request.headers
      .get("oai-authenticated-user-email")
      ?.trim()
      .toLowerCase() === owner
  );
}
export function requireSameOrigin(request: Request) {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
    request.headers.get("origin") !== new URL(request.url).origin
  )
    throw new HttpError(403, "Open this page directly and try again.");
}
export function requireOwner(request: Request, env: AuthEnv) {
  if (!isOwner(request, env))
    throw new HttpError(403, "Sign in as the owner to make this change.");
}
export function token() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (x) => x.toString(16).padStart(2, "0")).join("");
}
export function secureEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++)
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
export function bearer(request: Request) {
  return (
    request.headers
      .get("authorization")
      ?.match(/^Bearer ([a-f0-9]{64})$/)?.[1] ?? ""
  );
}
export const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'",
};
