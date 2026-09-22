import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { decode, encode } from "fast-png";
import { advanceJob, generationPrompt } from "../src/server/jobs";
import { advanceAnimation } from "../src/server/animations";
import { initialize, type WorldRow } from "../src/server/database";
import { partyState } from "../src/server/party";
import type { Env } from "../src/server/env";
import * as provider from "../src/server/provider";

vi.mock("../src/server/provider", async (original) => ({
  ...(await original<typeof import("../src/server/provider")>()),
  submitGeneration: vi.fn(),
  pollGeneration: vi.fn(),
  fetchResultImage: vi.fn(),
  submitVideoGeneration: vi.fn(),
  pollVideoGeneration: vi.fn(),
  fetchResultVideo: vi.fn(),
}));
let mf: Miniflare, env: Env;
const world: WorldRow = {
  id: "animation-test",
  name: "Party",
  theme: "party",
  uploads_open: 1,
  guest_token: "guest",
  display_token: "display",
  created_at: "2026-09-22",
};
const imageId = "11111111-1111-4111-8111-111111111111",
  videoId = "22222222-2222-4222-8222-222222222222";
const pixels = new Uint8Array(32 * 32 * 4).fill(255);
for (let y = 8; y < 24; y++)
  for (let x = 8; x < 24; x++) {
    const i = (y * 32 + x) * 4;
    pixels[i] = 60;
    pixels[i + 1] = 110;
    pixels[i + 2] = 200;
  }
const png = encode({ width: 32, height: 32, channels: 4, data: pixels });
const mp4 = new Uint8Array([
  0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0, 105, 115,
  111, 109, 109, 112, 52, 50,
]);
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "animation-jobs",
      modules: true,
      script: 'export default {fetch(){return new Response("fixture")}}',
      compatibilityDate: "2026-09-01",
      d1Databases: ["DB"],
      r2Buckets: ["MEDIA"],
    }),
  );
  await mf.ready;
  env = {
    DB: await mf.getD1Database("DB"),
    MEDIA: await mf.getR2Bucket("MEDIA"),
    HIGGSFIELD_API_KEY: "fixture-key",
    HIGGSFIELD_API_SECRET: "fixture-secret",
  } as unknown as Env;
  await initialize(env.DB);
  await env.DB.prepare(
    "INSERT INTO worlds(id,name,theme,guest_token,display_token,created_at) VALUES(?,?,?,?,?,?)",
  )
    .bind(
      world.id,
      world.name,
      world.theme,
      world.guest_token,
      world.display_token,
      world.created_at,
    )
    .run();
}, 30_000);
afterAll(async () => {
  await mf?.dispose();
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(provider.submitGeneration).mockResolvedValue({
    requestId: imageId,
  });
  vi.mocked(provider.pollGeneration).mockResolvedValue({
    status: "processing",
  });
  vi.mocked(provider.fetchResultImage).mockResolvedValue(png);
  vi.mocked(provider.submitVideoGeneration).mockResolvedValue({
    requestId: videoId,
  });
  vi.mocked(provider.pollVideoGeneration).mockResolvedValue({
    status: "processing",
  });
  vi.mocked(provider.fetchResultVideo).mockResolvedValue(mp4);
});
async function job() {
  const id = crypto.randomUUID();
  await env.MEDIA.put(`inputs/${id}.png`, png);
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO jobs(id,world_id,request_key,name,appearance,status,input_key,created_at,updated_at) VALUES(?,?,?,'Never send this name','animated','queued',?,?,?)",
    ).bind(
      id,
      world.id,
      id,
      `inputs/${id}.png`,
      new Date().toISOString(),
      new Date().toISOString(),
    ),
    env.DB.prepare(
      "INSERT INTO party_entries(job_id,world_id) VALUES(?,?)",
    ).bind(id, world.id),
    env.DB.prepare(
      "INSERT INTO animation_jobs(job_id,world_id,phase) VALUES(?,?,'illustrating')",
    ).bind(id, world.id),
  ]);
  return id;
}
async function row(id: string) {
  return await env.DB.prepare(
    "SELECT j.*,a.phase,a.poster_key,a.image_provider_id,a.video_provider_id FROM jobs j JOIN animation_jobs a ON a.job_id=j.id WHERE j.id=?",
  )
    .bind(id)
    .first<any>();
}
async function animateStage(id: string) {
  await advanceJob(env, id, world, false);
  vi.mocked(provider.pollGeneration).mockResolvedValue({
    status: "completed",
    imageUrl: "https://media.higgsfield.ai/image.png",
  });
  await advanceJob(env, id, world, false);
}

describe("durable two-stage animations", () => {
  it("submits each paid stage once, retains both IDs and queues only the final video", async () => {
    const id = await job();
    const before = await partyState(env.DB, world.id);
    await Promise.all(
      Array.from({ length: 4 }, () => advanceJob(env, id, world, false)),
    );
    expect(provider.submitGeneration).toHaveBeenCalledTimes(1);
    expect((await row(id)).phase).toBe("illustrating");
    vi.mocked(provider.pollGeneration).mockResolvedValue({
      status: "completed",
      imageUrl: "https://media.higgsfield.ai/image.png",
    });
    await Promise.all(
      Array.from({ length: 4 }, () => advanceJob(env, id, world, false)),
    );
    const staged = await row(id);
    expect(staged).toMatchObject({
      status: "queued",
      phase: "animating",
      provider_id: null,
      image_provider_id: imageId,
      video_provider_id: null,
    });
    expect((await partyState(env.DB, world.id)).total).toBe(before.total);
    expect(
      await env.DB.prepare("SELECT id FROM characters WHERE id=?")
        .bind(id)
        .first(),
    ).toBeNull();
    const poster = decode(
      new Uint8Array(
        await (await env.MEDIA.get(staged.poster_key))!.arrayBuffer(),
      ),
    );
    expect(poster.width).toBe(32);
    expect(poster.data[3]).toBe(255);
    await Promise.all(
      Array.from({ length: 4 }, () => advanceJob(env, id, world, false)),
    );
    expect(provider.submitVideoGeneration).toHaveBeenCalledTimes(1);
    expect(await row(id)).toMatchObject({
      status: "processing",
      provider_id: videoId,
      image_provider_id: imageId,
      video_provider_id: videoId,
    });
    vi.mocked(provider.pollVideoGeneration).mockResolvedValue({
      status: "completed",
      videoUrl: "https://media.higgsfield.ai/video.mp4",
    });
    await Promise.all(
      Array.from({ length: 4 }, () => advanceJob(env, id, world, false)),
    );
    expect((await row(id)).status).toBe("completed");
    const character = await env.DB.prepare(
      "SELECT asset_key,appearance FROM characters WHERE id=?",
    )
      .bind(id)
      .first<any>();
    expect(character.appearance).toBe("animated");
    expect(character.asset_key).toMatch(/\.mp4$/);
    expect(
      new Uint8Array(
        await (await env.MEDIA.get(character.asset_key))!.arrayBuffer(),
      ),
    ).toEqual(mp4);
    expect((await partyState(env.DB, world.id)).total).toBe(before.total + 1);
    await advanceJob(env, id, world, false);
    expect(provider.submitGeneration).toHaveBeenCalledTimes(1);
    expect(provider.submitVideoGeneration).toHaveBeenCalledTimes(1);
    expect(
      JSON.stringify(vi.mocked(provider.submitGeneration).mock.calls),
    ).not.toContain("Never send this name");
    expect(
      JSON.stringify(vi.mocked(provider.submitVideoGeneration).mock.calls),
    ).not.toContain("Never send this name");
  });

  it("leaves an ambiguous video submission uncertain and never regenerates either stage", async () => {
    const id = await job();
    await animateStage(id);
    vi.mocked(provider.submitVideoGeneration).mockRejectedValue(
      new provider.ProviderError("Safe diagnostic", true, true),
    );
    await advanceJob(env, id, world, false);
    await advanceJob(env, id, world, false);
    expect(await row(id)).toMatchObject({
      status: "uncertain",
      phase: "animating",
      image_provider_id: imageId,
      provider_id: null,
    });
    expect((await row(id)).message).toContain("animation");
    expect(provider.submitGeneration).toHaveBeenCalledTimes(1);
    expect(provider.submitVideoGeneration).toHaveBeenCalledTimes(1);
    expect(
      await env.DB.prepare("SELECT id FROM characters WHERE id=?")
        .bind(id)
        .first(),
    ).toBeNull();
  });

  it("retries a failed media read without creating a second video or publishing a still", async () => {
    const id = await job();
    await animateStage(id);
    await advanceJob(env, id, world, false);
    vi.mocked(provider.pollVideoGeneration).mockResolvedValue({
      status: "completed",
      videoUrl: "https://media.higgsfield.ai/video.mp4",
    });
    vi.mocked(provider.fetchResultVideo).mockRejectedValueOnce(
      new provider.ProviderError("Safe read failure", false, true),
    );
    await advanceJob(env, id, world, false);
    expect((await row(id)).status).toBe("processing");
    expect(
      await env.DB.prepare("SELECT id FROM characters WHERE id=?")
        .bind(id)
        .first(),
    ).toBeNull();
    await advanceJob(env, id, world, false);
    expect((await row(id)).status).toBe("completed");
    expect(provider.submitVideoGeneration).toHaveBeenCalledTimes(1);
  });

  it("records a terminal video failure with its phase and no still-character fallback", async () => {
    const id = await job();
    await animateStage(id);
    await advanceJob(env, id, world, false);
    vi.mocked(provider.pollVideoGeneration).mockResolvedValue({
      status: "failed",
      message: "untrusted raw fixture-secret",
    });
    await advanceJob(env, id, world, false);
    await advanceJob(env, id, world, false);
    const current = await row(id);
    expect(current).toMatchObject({
      status: "failed",
      phase: "animating",
      image_provider_id: imageId,
      video_provider_id: videoId,
    });
    expect(current.message).toContain("animation");
    expect(current.message).not.toContain("fixture-secret");
    expect(
      await env.DB.prepare("SELECT id FROM characters WHERE id=?")
        .bind(id)
        .first(),
    ).toBeNull();
    expect(provider.submitVideoGeneration).toHaveBeenCalledTimes(1);
  });

  it("fails animated demo uploads honestly without contacting any generation provider", async () => {
    const id = await job();
    await advanceJob(env, id, world, true);
    expect(await row(id)).toMatchObject({
      status: "failed",
      message:
        "Animation needs a live Higgsfield API connection. Demo mode does not generate video.",
    });
    expect(provider.submitGeneration).not.toHaveBeenCalled();
    expect(provider.submitVideoGeneration).not.toHaveBeenCalled();
    expect(
      await env.DB.prepare("SELECT id FROM characters WHERE id=?")
        .bind(id)
        .first(),
    ).toBeNull();
  });

  it("uses a colorful 3D image prompt without the flat-cutout instructions", () => {
    const prompt = generationPrompt("party", "animated");
    expect(prompt).toContain("3D");
    expect(prompt).toContain("colorful");
    expect(prompt).not.toMatch(/flat 2D|cutout|pencil\/crayon/);
  });

  it("fails a generated PNG with an unsupported scanline filter instead of retrying forever", async () => {
    const id = await job();
    await advanceJob(env, id, world, false);
    // Valid PNG chunks/CRC/size, but scanline filter 5 is unsupported by PNG.
    const malformed = Uint8Array.from(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMVkdP4DwACFwFfYXB1qAAAAABJRU5ErkJggg==",
        "base64",
      ),
    );
    vi.mocked(provider.pollGeneration).mockResolvedValue({
      status: "completed",
      imageUrl: "https://media.higgsfield.ai/image.png",
    });
    vi.mocked(provider.fetchResultImage).mockResolvedValue(malformed);
    await advanceJob(env, id, world, false);
    const failed = await row(id);
    expect(failed).toMatchObject({ status: "failed", phase: "illustrating" });
    expect(failed.message).not.toMatch(/Unsupported filter|fixture-secret/);
    await advanceJob(env, id, world, false);
    expect(provider.fetchResultImage).toHaveBeenCalledTimes(1);
    expect(provider.submitVideoGeneration).not.toHaveBeenCalled();
    expect(
      await env.DB.prepare("SELECT id FROM characters WHERE id=?")
        .bind(id)
        .first(),
    ).toBeNull();
  });

  it("does not age a fresh video submission using a stale illustration timestamp", async () => {
    const id = await job();
    const stale = {
      ...(await row(id)),
      status: "submitting",
      updated_at: "2020-01-01",
    };
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE animation_jobs SET phase='animating' WHERE job_id=?",
      ).bind(id),
      env.DB.prepare(
        "UPDATE jobs SET status='submitting',updated_at=? WHERE id=?",
      ).bind(new Date().toISOString(), id),
    ]);
    await advanceAnimation(
      env,
      stale,
      false,
      generationPrompt("party", "animated"),
    );
    expect((await row(id)).status).toBe("submitting");
    expect(provider.submitVideoGeneration).not.toHaveBeenCalled();
  });

  it("does not let an expired illustration worker reset the newer video lease or phase", async () => {
    const id = await job();
    await advanceJob(env, id, world, false);
    let release!: (value: provider.GenerationResult) => void;
    let entered!: () => void;
    const reached = new Promise<void>((resolve) => {
      entered = resolve;
    });
    vi.mocked(provider.pollGeneration).mockImplementation(() => {
      entered();
      return new Promise((resolve) => {
        release = resolve;
      });
    });
    const pending = advanceJob(env, id, world, false);
    await reached;
    const newerLease = Date.now() + 150_000;
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE animation_jobs SET phase='animating',video_provider_id=? WHERE job_id=?",
      ).bind(videoId, id),
      env.DB.prepare(
        "UPDATE jobs SET provider_id=?,lease_until=? WHERE id=?",
      ).bind(videoId, newerLease, id),
    ]);
    release({
      status: "completed",
      imageUrl: "https://media.higgsfield.ai/image.png",
    });
    await pending;
    expect(await row(id)).toMatchObject({
      status: "processing",
      phase: "animating",
      provider_id: videoId,
      lease_until: newerLease,
    });
    expect(
      await env.DB.prepare("SELECT id FROM characters WHERE id=?")
        .bind(id)
        .first(),
    ).toBeNull();
    expect(provider.submitGeneration).toHaveBeenCalledTimes(1);
    expect(provider.submitVideoGeneration).not.toHaveBeenCalled();
  });
});
