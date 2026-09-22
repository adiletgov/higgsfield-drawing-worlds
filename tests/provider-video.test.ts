import { afterEach, describe, expect, it, vi } from "vitest";
import {
  submitVideoGeneration,
  pollVideoGeneration,
  fetchResultVideo,
  ProviderError,
} from "../src/server/provider";

const env = {
  HIGGSFIELD_API_KEY: "fixture-key",
  HIGGSFIELD_API_SECRET: "fixture-secret",
};
const id = "11111111-1111-4111-8111-111111111111";
const png = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jQ1sAAAAASUVORK5CYII=",
    "base64",
  ),
);
const mp4 = new Uint8Array([
  0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0, 105, 115,
  111, 109, 109, 112, 52, 50,
]);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const upload = () =>
  json({
    public_url: "https://media.higgsfield.ai/poster.png",
    upload_url: "https://storage.higgsfield.ai/upload",
  });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("public animation provider", () => {
  it("uploads the poster without credentials then submits one documented five-second video request", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      if (calls.length === 1) return upload();
      if (calls.length === 2) return new Response(null);
      return json({ request_id: id, status: "queued" });
    });
    expect(
      await submitVideoGeneration(
        env,
        png,
        "Blink, wave, return to the starting pose.",
      ),
    ).toEqual({ requestId: id });
    expect(calls.map((c) => [c.url, c.init.method])).toEqual([
      ["https://api.higgsfield.ai/files/generate-upload-url", "POST"],
      ["https://storage.higgsfield.ai/upload", "PUT"],
      [
        "https://api.higgsfield.ai/kling-video/v2.5-turbo/standard/image-to-video",
        "POST",
      ],
    ]);
    expect(new Headers(calls[1].init.headers).has("authorization")).toBe(false);
    expect(JSON.parse(String(calls[2].init.body))).toEqual({
      prompt: "Blink, wave, return to the starting pose.",
      image_url: "https://media.higgsfield.ai/poster.png",
      duration: 5,
      cfg_scale: 0.5,
      negative_prompt: expect.any(String),
    });
    expect(calls.every((c) => c.init.redirect === "manual")).toBe(true);
  });
  it("never repeats an uncertain paid video submission", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      if (calls === 1) return upload();
      if (calls === 2) return new Response(null);
      throw new Error("fixture-secret");
    });
    const error = await submitVideoGeneration(env, png, "Wave.").catch(
      (e) => e,
    );
    expect(error).toBeInstanceOf(ProviderError);
    expect(error.uncertain).toBe(true);
    expect(error.message).not.toContain("fixture-secret");
    expect(calls).toBe(3);
  });
  it("extracts only a matching singular video result", async () => {
    vi.stubGlobal("fetch", async () =>
      json({
        request_id: id,
        status: "completed",
        video: { url: "https://media.higgsfield.ai/result.mp4" },
      }),
    );
    expect(await pollVideoGeneration(env, id)).toEqual({
      status: "completed",
      videoUrl: "https://media.higgsfield.ai/result.mp4",
    });
  });
  it.each([
    {
      request_id: "22222222-2222-4222-8222-222222222222",
      status: "completed",
      video: { url: "https://media.higgsfield.ai/a.mp4" },
    },
    {
      request_id: id,
      status: "completed",
      images: [{ url: "https://media.higgsfield.ai/a.png" }],
    },
    {
      request_id: id,
      status: "completed",
      video: { url: "https://127.0.0.1/a.mp4" },
    },
  ])("rejects unrelated or unsafe video results %#", async (result) => {
    vi.stubGlobal("fetch", async () => json(result));
    await expect(pollVideoGeneration(env, id)).rejects.toBeInstanceOf(
      ProviderError,
    );
  });
  it.each(["queued", "in_progress", "failed", "nsfw", "canceled"])(
    "maps video lifecycle %s without leaking provider text",
    async (status) => {
      vi.stubGlobal("fetch", async () =>
        json({ request_id: id, status, error: "fixture-secret" }),
      );
      const result = await pollVideoGeneration(env, id);
      expect(result.status).toBe(
        ["queued", "in_progress"].includes(status) ? "processing" : "failed",
      );
      expect(JSON.stringify(result)).not.toContain("fixture-secret");
    },
  );
  it("downloads bounded MP4 bytes without authorization or redirects", async () => {
    let options: RequestInit | undefined;
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      options = init;
      return new Response(mp4, { headers: { "Content-Type": "video/mp4" } });
    });
    expect(
      await fetchResultVideo("https://media.higgsfield.ai/result.mp4"),
    ).toEqual(mp4);
    expect(options?.redirect).toBe("manual");
    expect(new Headers(options?.headers).has("authorization")).toBe(false);
  });
  it.each([
    () =>
      new Response(mp4, {
        status: 302,
        headers: {
          Location: "https://other.example/x",
          "Content-Type": "video/mp4",
        },
      }),
    () => new Response(mp4, { headers: { "Content-Type": "text/html" } }),
    () =>
      new Response("not a video", { headers: { "Content-Type": "video/mp4" } }),
    () =>
      new Response(mp4, {
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": String(48 * 1024 * 1024 + 1),
        },
      }),
    () =>
      new Response(
        new Uint8Array([
          0, 0, 0, 24, 102, 116, 121, 112, 97, 118, 105, 102, 0, 0, 0, 0, 97,
          118, 105, 102, 109, 105, 102, 49,
        ]),
        { headers: { "Content-Type": "video/mp4" } },
      ),
  ])(
    "rejects redirected, oversized, wrong-format, or non-video data %#",
    async (response) => {
      const fetch = vi.fn(async () => response());
      vi.stubGlobal("fetch", fetch);
      await expect(
        fetchResultVideo("https://media.higgsfield.ai/result.mp4"),
      ).rejects.toBeInstanceOf(ProviderError);
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
  it("bounds streamed video data when content length is absent", async () => {
    let canceled = false;
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(new Uint8Array(48 * 1024 * 1024 + 1));
            },
            cancel() {
              canceled = true;
            },
          }),
          { headers: { "Content-Type": "video/mp4" } },
        ),
    );
    await expect(
      fetchResultVideo("https://media.higgsfield.ai/result.mp4"),
    ).rejects.toBeInstanceOf(ProviderError);
    expect(canceled).toBe(true);
  });
  it("rejects private video URLs before contacting them", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      fetchResultVideo("https://metadata.google.internal/video.mp4"),
    ).rejects.toBeInstanceOf(ProviderError);
    expect(fetch).not.toHaveBeenCalled();
  });
});
