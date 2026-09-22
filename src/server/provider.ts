export interface ProviderEnv {
  HIGGSFIELD_API_KEY: string;
  HIGGSFIELD_API_SECRET: string;
}

export interface GenerationResult {
  status: "processing" | "completed" | "failed";
  imageUrl?: string;
  message?: string;
}

/** Safe messages only: never attach a provider body, URL, credentials or cause. */
export class ProviderError extends Error {
  constructor(
    message: string,
    public uncertain = false,
    public retryable = false,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

const API = "https://api.higgsfield.ai";
const IMAGE_BYTES = 12 * 1024 * 1024;
const JSON_BYTES = 256 * 1024;
const TIMEOUT_MS = 30_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderError(
      "The image service returned an unexpected response.",
      false,
      true,
    );
  }
  return value as Record<string, unknown>;
}

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 24 &&
    PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)
  );
}

function authorization(env: ProviderEnv): string {
  const key = env.HIGGSFIELD_API_KEY?.trim();
  const secret = env.HIGGSFIELD_API_SECRET?.trim();
  if (!key || !secret || /[\r\n]/.test(key + secret)) {
    throw new ProviderError(
      "The owner needs to configure Higgsfield API access.",
    );
  }
  return `Key ${key}:${secret}`;
}

/**
 * Media hosts are not enumerated in the public provider contract. This validator
 * is for URLs obtained server-to-server from our stored generation, never guest
 * input. It rejects literal/private-name destinations but is not a DNS resolver
 * or a complete DNS-rebinding defense. Keep this adapter on Workers external
 * fetch; an intranet-capable Node deployment needs verified exact-host egress.
 */
function mediaUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 8192) {
    throw new ProviderError(
      "The image service returned an unsupported file location.",
    );
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ProviderError(
      "The image service returned an unsupported file location.",
    );
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const labels = host.split(".");
  const privateNames = [
    "localhost",
    "local",
    "internal",
    "intranet",
    "lan",
    "home",
    "test",
    "invalid",
    "example",
    "onion",
  ];
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    host.includes(":") ||
    /^\d+(?:\.\d+)*$/.test(host) ||
    labels.length < 2 ||
    labels.some(
      (label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label),
    ) ||
    privateNames.some((name) => host === name || host.endsWith(`.${name}`))
  ) {
    throw new ProviderError(
      "The image service returned an unsupported file location.",
    );
  }
  return url.href;
}

async function withDeadline<T>(
  work: (signal: AbortSignal) => Promise<T>,
  uncertain = false,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(
        new ProviderError(
          uncertain
            ? "The image service did not confirm this submission. Check its status before trying again."
            : "The image service took too long to respond. Please try checking again.",
          uncertain,
          true,
        ),
      );
    }, TIMEOUT_MS);
  });
  try {
    return await Promise.race([work(controller.signal), deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function boundedBytes(
  response: Response,
  max: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const declared = response.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > max)) {
    await response.body?.cancel().catch(() => undefined);
    throw new ProviderError(
      "The image service returned a file that is too large.",
    );
  }
  if (!response.body)
    throw new ProviderError(
      "The image service returned an empty response.",
      false,
      true,
    );
  const reader = response.body.getReader();
  const abort = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", abort, { once: true });
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      if (signal.aborted)
        throw new ProviderError(
          "The image service took too long to respond.",
          false,
          true,
        );
      const { done, value } = await reader.read();
      if (signal.aborted)
        throw new ProviderError(
          "The image service took too long to respond.",
          false,
          true,
        );
      if (done) break;
      length += value.length;
      if (length > max) {
        await reader.cancel().catch(() => undefined);
        throw new ProviderError(
          "The image service returned a file that is too large.",
        );
      }
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
  if (!length)
    throw new ProviderError(
      "The image service returned an empty response.",
      false,
      true,
    );
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function httpError(status: number, billable: boolean): ProviderError {
  if (status === 401)
    return new ProviderError("The owner needs to check Higgsfield API access.");
  if (status === 403)
    return new ProviderError(
      "The owner needs to check the Higgsfield API balance.",
    );
  if (status === 404)
    return new ProviderError(
      "This image service request or model is unavailable.",
    );
  if (status === 400 || status === 422)
    return new ProviderError(
      "The image service could not accept this request.",
    );
  const transient = status === 423 || status === 429 || status >= 500;
  return new ProviderError(
    "The image service is temporarily unavailable. Please check again later.",
    billable && status >= 500,
    transient,
  );
}

async function apiJson(
  env: ProviderEnv,
  path: string,
  body?: unknown,
  billable = false,
): Promise<Record<string, unknown>> {
  const auth = authorization(env);
  return withDeadline(async (signal) => {
    let response: Response;
    try {
      response = await fetch(`${API}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: auth,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "error",
        signal,
      });
    } catch {
      throw new ProviderError(
        "The image service could not be reached. Please check again later.",
        billable,
        true,
      );
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw httpError(response.status, billable);
    }
    try {
      const bytes = await boundedBytes(response, JSON_BYTES, signal);
      return object(JSON.parse(new TextDecoder().decode(bytes)));
    } catch {
      throw new ProviderError(
        "The image service returned an unexpected response.",
        billable,
        true,
      );
    }
  }, billable);
}

export async function submitGeneration(
  env: ProviderEnv,
  png: Uint8Array,
  prompt: string,
): Promise<{ requestId: string }> {
  if (png.length > IMAGE_BYTES || !isPng(png))
    throw new ProviderError(
      "Please upload a valid PNG drawing smaller than 12 MB.",
    );
  if (!prompt.trim())
    throw new ProviderError("The drawing instructions are missing.");
  const upload = await apiJson(env, "/files/generate-upload-url", {
    content_type: "image/png",
  });
  const publicUrl = mediaUrl(upload.public_url);
  const target = mediaUrl(upload.upload_url);
  const returnedHeaders = object(upload.upload_headers);
  const headers = new Headers();
  for (const [name, value] of Object.entries(returnedHeaders)) {
    if (
      typeof value !== "string" ||
      /^(authorization|proxy-authorization|cookie|host)$/i.test(name) ||
      /[\r\n]/.test(value)
    ) {
      throw new ProviderError(
        "The image service returned invalid upload settings.",
      );
    }
    try {
      headers.set(name, value);
    } catch {
      throw new ProviderError(
        "The image service returned invalid upload settings.",
      );
    }
  }
  if (headers.get("content-type")?.split(";")[0].trim() !== "image/png") {
    throw new ProviderError(
      "The image service returned an unsupported upload format.",
    );
  }
  await withDeadline(async (signal) => {
    try {
      const response = await fetch(target, {
        method: "PUT",
        headers,
        body: png as Uint8Array<ArrayBuffer>,
        redirect: "error",
        signal,
      });
      await response.body?.cancel().catch(() => undefined);
      if (!response.ok)
        throw new ProviderError(
          "The drawing could not be uploaded. Please try again.",
          false,
          true,
        );
    } catch {
      throw new ProviderError(
        "The drawing could not be uploaded. Please try again.",
        false,
        true,
      );
    }
  });
  // A POST is deliberately sent once. The provider has no idempotency key.
  const result = await apiJson(
    env,
    "/alibaba/qwen-image-3/edit",
    {
      prompt,
      image_urls: [publicUrl],
      resolution: "1k",
      aspect_ratio: "1:1",
      prompt_extend: true,
      enable_thinking: true,
      prompt_extend_mode: "direct",
    },
    true,
  );
  if (typeof result.request_id !== "string" || !UUID.test(result.request_id)) {
    throw new ProviderError(
      "The image service did not confirm a request ID. Check before trying again.",
      true,
    );
  }
  return { requestId: result.request_id };
}

export async function pollGeneration(
  env: ProviderEnv,
  id: string,
): Promise<GenerationResult> {
  if (!UUID.test(id))
    throw new ProviderError("The saved image request is invalid.");
  // Canonical documented path prevents provider/client URL substitution.
  const result = await apiJson(env, `/requests/${id}/status`);
  if (
    typeof result.request_id !== "string" ||
    result.request_id.toLowerCase() !== id.toLowerCase()
  ) {
    throw new ProviderError(
      "The image service returned a different request.",
      false,
      true,
    );
  }
  if (result.status === "queued" || result.status === "in_progress")
    return { status: "processing" };
  if (result.status === "failed")
    return {
      status: "failed",
      message:
        "This drawing could not be generated. You can try another drawing.",
    };
  if (result.status === "nsfw")
    return {
      status: "failed",
      message:
        "This drawing could not be processed under the image service rules.",
    };
  if (result.status === "canceled")
    return { status: "failed", message: "This drawing request was canceled." };
  if (
    result.status === "completed" &&
    Array.isArray(result.images) &&
    result.images.length
  ) {
    return {
      status: "completed",
      imageUrl: mediaUrl(object(result.images[0]).url),
    };
  }
  throw new ProviderError(
    "The image service has not returned a usable image. Please check again later.",
    false,
    true,
  );
}

/** Call only with a URL extracted from pollGeneration for the stored local job. */
export async function fetchResultImage(url: string): Promise<Uint8Array> {
  const target = mediaUrl(url);
  return withDeadline(async (signal) => {
    try {
      const response = await fetch(target, {
        method: "GET",
        redirect: "error",
        signal,
      });
      if (
        !response.ok ||
        response.redirected ||
        response.headers
          .get("content-type")
          ?.split(";")[0]
          .trim()
          .toLowerCase() !== "image/png"
      ) {
        await response.body?.cancel().catch(() => undefined);
        throw new ProviderError(
          "The generated image could not be downloaded.",
          false,
          true,
        );
      }
      const bytes = await boundedBytes(response, IMAGE_BYTES, signal);
      if (!isPng(bytes))
        throw new ProviderError(
          "The image service returned an unsupported image format.",
        );
      return bytes;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(
        "The generated image could not be downloaded. Please check again later.",
        false,
        true,
      );
    }
  });
}
