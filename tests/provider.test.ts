import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchResultImage,
  pollGeneration,
  ProviderError,
  checkProviderConnection,
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
  it("checks connection with only one non-billable upload-URL request and returns no URLs or headers", async () => {
    const requests: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      requests.push({ url: String(url), init });
      return upload();
    });
    const result = await checkProviderConnection(env);
    expect(result).toMatchObject({
      ok: true,
      classification: "ready",
      httpStatus: 200,
      schemaValid: true,
      uploadHeadersValid: true,
    });
    expect(
      requests.map((request) => [request.url, request.init.method]),
    ).toEqual([[`${api}/files/generate-upload-url`, "POST"]]);
    expect(JSON.parse(String(requests[0].init.body))).toEqual({
      content_type: "image/png",
    });
    expect(JSON.stringify(result)).not.toMatch(
      /https:|fixture-secret|signature|upload_headers|Authorization/,
    );
  });

  it.each([
    ["getaddrinfo ENOTFOUND private-host fixture-secret", "dns"],
    ["certificate verify failed fixture-secret", "tls"],
    ["fetch redirect not allowed fixture-secret", "redirect"],
    ["Invalid header value fixture-secret", "invalid-header"],
    [
      "Cannot convert value to ByteString because a character is greater than 255 fixture-secret",
      "invalid-header",
    ],
    [
      "Header value contains non-ISO-8859-1 characters fixture-secret",
      "invalid-header",
    ],
    ["Unsupported cache mode fixture-secret", "unsupported-option"],
    ["Unsupported redirect mode fixture-secret", "unsupported-option"],
    ["Network access denied fixture-secret", "network-denied"],
    ["URL is not allowed fixture-secret", "network-denied"],
    ["error code 1042 cross-worker fetch fixture-secret", "network-denied"],
    [
      "global_fetch_strictly_public restricted fixture-secret",
      "network-denied",
    ],
    ["unclassified transport problem fixture-secret", "network"],
  ])(
    "classifies a connection failure without exposing its raw details %#",
    async (message, classification) => {
      vi.stubGlobal("fetch", async () => {
        throw new Error(message);
      });
      const result = await checkProviderConnection(env);
      expect(result).toMatchObject({ ok: false, classification });
      expect(JSON.stringify(result)).not.toContain("fixture-secret");
    },
  );

  it("reports an API rejection by safe status without exposing the provider body", async () => {
    const fetch = vi.fn(async () => json({ detail: "fixture-secret" }, 401));
    vi.stubGlobal("fetch", fetch);
    const result = await checkProviderConnection(env);
    expect(result).toMatchObject({
      ok: false,
      classification: "api-rejected",
      httpStatus: 401,
    });
    expect(JSON.stringify(result)).not.toContain("fixture-secret");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result).not.toHaveProperty("probes");
  });

  it("probes only fixed credential-free routes after the authenticated fetch throws", async () => {
    const requests: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      requests.push({ url: String(url), init });
      if (requests.length === 1)
        throw new Error("Network error fixture-secret");
      return json(
        { private: "fixture-secret" },
        requests.length === 2 ? 401 : 200,
      );
    });
    const result = await checkProviderConnection(env);
    expect(
      requests.map(({ url, init }) => [url, init.method, init.redirect]),
    ).toEqual([
      [`${api}/files/generate-upload-url`, "POST", "manual"],
      [`${api}/files/generate-upload-url`, "POST", "manual"],
      ["https://docs.higgsfield.ai/docs/authentication", "GET", "manual"],
    ]);
    for (const request of requests.slice(1)) {
      const headers = new Headers(request.init.headers);
      expect(headers.has("authorization")).toBe(false);
      expect(headers.has("cookie")).toBe(false);
      expect(request.init.credentials).toBe("omit");
    }
    expect(result).toMatchObject({
      ok: false,
      classification: "network",
      probes: {
        anonymousPost: { classification: "http-response", httpStatus: 401 },
        documentationGet: { classification: "http-response", httpStatus: 200 },
      },
    });
    expect(result.message).toContain(
      "Credential-free API check: HTTP 401. Documentation check: HTTP 200.",
    );
    expect(JSON.stringify(result)).not.toMatch(
      /https:|fixture-secret|private|Authorization/,
    );
  });

  it("reports a finite probe failure and an unfollowed redirect without its location", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      if (calls === 1) throw new Error("Invalid header fixture-secret");
      if (calls === 2) throw new Error("getaddrinfo ENOTFOUND fixture-secret");
      return new Response("fixture-secret", {
        status: 302,
        headers: { Location: "https://private.example/fixture-secret" },
      });
    });
    const result = await checkProviderConnection(env);
    expect(calls).toBe(3);
    expect(result).toMatchObject({
      classification: "invalid-header",
      probes: {
        anonymousPost: { classification: "dns" },
        documentationGet: { classification: "redirect", httpStatus: 302 },
      },
    });
    expect(result.message).toContain(
      "Credential-free API check: dns. Documentation check: HTTP 302.",
    );
    expect(JSON.stringify(result)).not.toMatch(
      /https:|fixture-secret|ENOTFOUND|Location/,
    );
  });

  it("reports an authenticated diagnostic redirect without following it or probing", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { Location: "https://other.example/fixture-secret" },
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const result = await checkProviderConnection(env);
    expect(result).toMatchObject({
      ok: false,
      classification: "redirect",
      httpStatus: 302,
    });
    expect(result).not.toHaveProperty("probes");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toMatch(/other.example|fixture-secret/);
  });

  it("reports upload schema and header validity independently", async () => {
    vi.stubGlobal("fetch", async () =>
      json({
        public_url: "https://media.higgsfield.ai/a.png",
        upload_url: "https://storage.higgsfield.ai/upload",
        upload_headers: { Authorization: "fixture-secret" },
      }),
    );
    expect(await checkProviderConnection(env)).toMatchObject({
      ok: false,
      schemaValid: true,
      uploadHeadersValid: false,
    });
    vi.stubGlobal("fetch", async () =>
      json({ upload_headers: { "Content-Type": "image/png" } }),
    );
    expect(await checkProviderConnection(env)).toMatchObject({
      ok: false,
      schemaValid: false,
      uploadHeadersValid: true,
    });
  });

  it("does not contact the provider when connection credentials are missing", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      return upload();
    });
    expect(
      await checkProviderConnection({
        HIGGSFIELD_API_KEY: "",
        HIGGSFIELD_API_SECRET: "",
      }),
    ).toMatchObject({ ok: false, classification: "not-configured" });
    expect(calls).toBe(0);
  });

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
    expect(requests.every((r) => r.init.redirect === "manual")).toBe(true);
  });

  it.each([302, 307, 308])(
    "rejects API %i without forwarding credentials or retrying a generation",
    async (status) => {
      const requests: { url: string; init: RequestInit }[] = [];
      vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
        requests.push({ url: String(url), init });
        if (requests.length === 1) return upload();
        if (requests.length === 2) return new Response(null);
        return new Response("fixture-secret", {
          status,
          headers: { Location: "https://other.example/fixture-secret" },
        });
      });
      const error = await submitGeneration(env, png, "One character.").catch(
        (e) => e,
      );
      expect(error).toBeInstanceOf(ProviderError);
      expect(error.message).toBe(
        "The image service returned a redirect that cannot be followed.",
      );
      expect(error.retryable).toBe(false);
      expect(requests.map(({ url }) => url)).toEqual([
        `${api}/files/generate-upload-url`,
        "https://storage.higgsfield.ai/upload/fixture?signature=fixture",
        `${api}/alibaba/qwen-image-3/edit`,
      ]);
      expect(requests.every(({ init }) => init.redirect === "manual")).toBe(
        true,
      );
    },
  );

  it("rejects a redirected upload PUT before generation and never contacts its destination", async () => {
    const requests: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      requests.push({ url: String(url), init });
      if (requests.length === 1) return upload();
      return new Response(null, {
        status: 302,
        headers: { Location: "https://other.example/fixture-secret" },
      });
    });
    await expect(
      submitGeneration(env, png, "One character."),
    ).rejects.toBeInstanceOf(ProviderError);
    expect(
      requests.map(({ url, init }) => [url, init.method, init.redirect]),
    ).toEqual([
      [`${api}/files/generate-upload-url`, "POST", "manual"],
      [
        "https://storage.higgsfield.ai/upload/fixture?signature=fixture",
        "PUT",
        "manual",
      ],
    ]);
    expect(new Headers(requests[1].init.headers).has("authorization")).toBe(
      false,
    );
  });

  it.each([undefined, null, {}])(
    "accepts optional upload headers %j using the requested PNG content type",
    async (uploadHeaders) => {
      const requests: RequestInit[] = [];
      vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
        requests.push(init);
        if (requests.length === 1)
          return json({
            public_url: "https://media.higgsfield.ai/input/fixture.png",
            upload_url: "https://storage.higgsfield.ai/upload/fixture",
            ...(uploadHeaders === undefined
              ? {}
              : { upload_headers: uploadHeaders }),
          });
        if (requests.length === 2) return new Response(null);
        return accepted();
      });
      await expect(
        submitGeneration(env, png, "One character."),
      ).resolves.toEqual({ requestId: id });
      expect(new Headers(requests[1].headers).get("content-type")).toBe(
        "image/png",
      );
      expect(new Headers(requests[1].headers).get("authorization")).toBeNull();
    },
  );

  it.each([
    { "Content-Type": "image/png", Authorization: "unexpected" },
    { "Content-Type": "text/html" },
    { "Content-Type": "image/png", "x-amz-tagging": "bad\r\nheader" },
    { "x-amz-tagging": "present-but-no-content-type" },
  ])(
    "rejects supplied invalid headers without applying the optional-header fallback %#",
    async (uploadHeaders) => {
      let calls = 0;
      vi.stubGlobal("fetch", async () => {
        calls++;
        return json({
          public_url: "https://media.higgsfield.ai/input/fixture.png",
          upload_url: "https://storage.higgsfield.ai/upload/fixture",
          upload_headers: uploadHeaders,
        });
      });
      await expect(
        submitGeneration(env, png, "One character."),
      ).rejects.toBeInstanceOf(ProviderError);
      expect(calls).toBe(1);
    },
  );

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
    expect(options?.redirect).toBe("manual");
  });

  it("rejects a result redirect without contacting its destination", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { Location: "https://other.example/fixture-secret" },
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const error = await fetchResultImage(
      "https://media.higgsfield.ai/image.png",
    ).catch((e) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error.message).not.toContain("fixture-secret");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]).toEqual([
      "https://media.higgsfield.ai/image.png",
      expect.objectContaining({ method: "GET", redirect: "manual" }),
    ]);
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
