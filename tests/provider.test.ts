import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchResultImage,
  pollGeneration,
  ProviderError,
  submitGeneration,
} from "../src/server/provider";

const env = {
  HIGGSFIELD_API_KEY: "fixture-key",
  HIGGSFIELD_API_SECRET: "fixture-secret",
};
const id = "11111111-1111-4111-8111-111111111111";
const api = "https://api.higgsfield.ai";
const png = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jQ1sAAAAASUVORK5CYII=",
    "base64",
  ),
);
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const upload = () =>
  json({
    public_url: "https://media.higgsfield.ai/input/fixture.png",
    upload_url:
      "https://storage.higgsfield.ai/upload/fixture?signature=fixture",
    content_type: "image/png",
    upload_headers: {
      "Content-Type": "image/png",
      "x-amz-tagging": "retention=temporary",
    },
  });
const accepted = () =>
  json({
    status: "queued",
    request_id: id,
    status_url: `${api}/requests/${id}/status`,
    cancel_url: `${api}/requests/${id}/cancel`,
  });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("public Higgsfield provider", () => {
  it("uploads bytes without credentials and submits one flat Qwen edit request", async () => {
    const requests: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      requests.push({ url: String(url), init });
      if (requests.length === 1) return upload();
      if (requests.length === 2) return new Response(null, { status: 200 });
      return accepted();
    });
    await expect(
      submitGeneration(env, png, "Keep the drawing."),
    ).resolves.toEqual({ requestId: id });
    expect(requests.map((r) => [r.url, r.init.method])).toEqual([
      [`${api}/files/generate-upload-url`, "POST"],
      ["https://storage.higgsfield.ai/upload/fixture?signature=fixture", "PUT"],
      [`${api}/alibaba/qwen-image-3/edit`, "POST"],
    ]);
    const inputHeaders = new Headers(requests[1].init.headers);
    expect(inputHeaders.get("authorization")).toBeNull();
    expect(inputHeaders.get("x-amz-tagging")).toBe("retention=temporary");
    expect(requests[1].init.body).toEqual(png);
    expect(new Headers(requests[2].init.headers).get("authorization")).toBe(
      "Key fixture-key:fixture-secret",
    );
    expect(JSON.parse(String(requests[2].init.body))).toEqual({
      prompt: "Keep the drawing.",
      image_urls: ["https://media.higgsfield.ai/input/fixture.png"],
      resolution: "1k",
      aspect_ratio: "1:1",
      prompt_extend: true,
      enable_thinking: true,
      prompt_extend_mode: "direct",
    });
    expect(requests.every((r) => r.init.redirect === "error")).toBe(true);
  });

  it("does not repeat an ambiguous billable submission or expose the transport error", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      if (calls === 1) return upload();
      if (calls === 2) return new Response(null);
      throw new Error("fixture-secret secret internal URL");
    });
    const error = await submitGeneration(env, png, "One character.").catch(
      (e) => e,
    );
    expect(error).toBeInstanceOf(ProviderError);
    expect(error.uncertain).toBe(true);
    expect(error.message).not.toContain("fixture-secret");
    expect(calls).toBe(3);
  });

  it("sanitizes an upload authorization error without claiming a generation was submitted", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      return json({ detail: "fixture-secret" }, 401);
    });
    const error = await submitGeneration(env, png, "One character.").catch(
      (e) => e,
    );
    expect(error).toBeInstanceOf(ProviderError);
    expect(error.uncertain).toBe(false);
    expect(error.message).not.toContain("fixture-secret");
    expect(calls).toBe(1);
  });

  it("rejects a provider upload response directing bytes to a private host", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      return json({
        public_url: "https://media.higgsfield.ai/x.png",
        upload_url: "https://127.0.0.1/upload",
        upload_headers: { "Content-Type": "image/png" },
      });
    });
    await expect(
      submitGeneration(env, png, "One character."),
    ).rejects.toBeInstanceOf(ProviderError);
    expect(calls).toBe(1);
  });

  it("bounds PNG input before making any external request", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      return accepted();
    });
    await expect(
      submitGeneration(
        env,
        new Uint8Array(12 * 1024 * 1024 + 1),
        "One character.",
      ),
    ).rejects.toBeInstanceOf(ProviderError);
    await expect(
      submitGeneration(env, new Uint8Array([1, 2, 3]), "One character."),
    ).rejects.toBeInstanceOf(ProviderError);
    expect(calls).toBe(0);
  });

  it.each(["queued", "in_progress"])(
    "maps %s to processing using the canonical authenticated endpoint",
    async (status) => {
      const requests: { url: string; init: RequestInit }[] = [];
      vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
        requests.push({ url: String(url), init });
        return json({ status, request_id: id });
      });
      await expect(pollGeneration(env, id)).resolves.toEqual({
        status: "processing",
      });
      expect(requests[0]?.url).toBe(`${api}/requests/${id}/status`);
      expect(new Headers(requests[0]?.init.headers).get("authorization")).toBe(
        "Key fixture-key:fixture-secret",
      );
    },
  );

  it("extracts the raw REST image result only from a matching completed request", async () => {
    vi.stubGlobal("fetch", async () =>
      json({
        status: "completed",
        request_id: id,
        images: [{ url: "https://media.higgsfield.ai/output.png" }],
      }),
    );
    await expect(pollGeneration(env, id)).resolves.toEqual({
      status: "completed",
      imageUrl: "https://media.higgsfield.ai/output.png",
    });
  });

  it.each(["failed", "nsfw", "canceled"])(
    "sanitizes terminal %s messages",
    async (status) => {
      vi.stubGlobal("fetch", async () =>
        json({ status, request_id: id, error: "fixture-secret" }),
      );
      const result = await pollGeneration(env, id);
      expect(result.status).toBe("failed");
      expect(result.message).toBeTruthy();
      expect(result.message).not.toContain("fixture-secret");
    },
  );

  it("rejects an invalid request ID before sending credentials anywhere", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      return accepted();
    });
    await expect(pollGeneration(env, "../../files")).rejects.toBeInstanceOf(
      ProviderError,
    );
    expect(calls).toBe(0);
  });

  it.each([
    { status: "completed", request_id: id, images: [] },
    {
      status: "completed",
      request_id: "22222222-2222-4222-8222-222222222222",
      images: [{ url: "https://media.higgsfield.ai/a.png" }],
    },
    {
      status: "completed",
      request_id: id,
      images: [{ url: "https://localhost/a.png" }],
    },
    { status: "surprise", request_id: id },
  ])("rejects malformed completed/pending response %#", async (fixture) => {
    vi.stubGlobal("fetch", async () => json(fixture));
    await expect(pollGeneration(env, id)).rejects.toBeInstanceOf(ProviderError);
  });

  it("marks transient polling failure retryable without leaking response text", async () => {
    vi.stubGlobal("fetch", async () => json({ detail: "fixture-secret" }, 503));
    const error = await pollGeneration(env, id).catch((e) => e);
    expect(error.retryable).toBe(true);
    expect(error.uncertain).toBe(false);
    expect(error.message).not.toContain("fixture-secret");
  });

  it("downloads bounded PNG results without credentials or redirects", async () => {
    let options: RequestInit | undefined;
    vi.stubGlobal("fetch", async (_: string, init: RequestInit) => {
      options = init;
      return new Response(png, { headers: { "Content-Type": "image/png" } });
    });
    await expect(
      fetchResultImage("https://media.higgsfield.ai/a.png?signature=fixture"),
    ).resolves.toEqual(png);
    expect(new Headers(options?.headers).get("authorization")).toBeNull();
    expect(options?.redirect).toBe("error");
  });

  it.each([
    "http://media.higgsfield.ai/x.png",
    "https://localhost/x",
    "https://sub.localhost/x",
    "https://127.0.0.1/x",
    "https://0x7f000001/x",
    "https://2130706433/x",
    "https://[::1]/x",
    "https://10.0.0.1/x",
    "https://metadata.google.internal/x",
    "https://host.local/x",
    "https://secret@media.higgsfield.ai/x",
    "https://media.higgsfield.ai:8443/x",
    "file:///etc/passwd",
  ])("rejects unsafe image URL %s before fetch", async (url) => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      return new Response(png);
    });
    await expect(fetchResultImage(url)).rejects.toBeInstanceOf(ProviderError);
    expect(calls).toBe(0);
  });

  it("rejects oversized, redirected and non-image results", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(null, {
          headers: {
            "Content-Type": "image/png",
            "Content-Length": String(12 * 1024 * 1024 + 1),
          },
        }),
    );
    await expect(
      fetchResultImage("https://media.higgsfield.ai/x"),
    ).rejects.toBeInstanceOf(ProviderError);
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(null, {
          status: 302,
          headers: { Location: "https://127.0.0.1" },
        }),
    );
    await expect(
      fetchResultImage("https://media.higgsfield.ai/x"),
    ).rejects.toBeInstanceOf(ProviderError);
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response("<script>secret</script>", {
          headers: { "Content-Type": "text/html" },
        }),
    );
    await expect(
      fetchResultImage("https://media.higgsfield.ai/x"),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it("bounds streamed bytes even when content length is omitted", async () => {
    let canceled = false;
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(12 * 1024 * 1024 + 1));
            },
            cancel() {
              canceled = true;
            },
          }),
          { headers: { "Content-Type": "image/png" } },
        ),
    );
    await expect(
      fetchResultImage("https://media.higgsfield.ai/x"),
    ).rejects.toBeInstanceOf(ProviderError);
    expect(canceled).toBe(true);
  });

  it("times out a stalled result body", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(new ReadableStream({ start() {} }), {
          headers: { "Content-Type": "image/png" },
        }),
    );
    const pending = fetchResultImage("https://media.higgsfield.ai/x").catch(
      (error) => error,
    );
    await vi.advanceTimersByTimeAsync(31_000);
    expect(await pending).toBeInstanceOf(ProviderError);
  });
});
