import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { advanceJob } from "../src/server/jobs";
import { initialize, type WorldRow } from "../src/server/database";
import type { Env } from "../src/server/env";

let mf: Miniflare;
let env: Env;
const world: WorldRow = {
  id: "diagnostic-world",
  name: "Diagnostics",
  theme: "aquarium",
  uploads_open: 1,
  guest_token: "guest",
  display_token: "display",
  created_at: "2026-09-22",
};

beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "job-diagnostics",
      modules: true,
      script: 'export default { fetch() { return new Response("fixture"); } };',
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
    "INSERT INTO worlds (id,name,theme,guest_token,display_token,created_at) VALUES (?,?,?,?,?,?)",
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
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  await mf?.dispose();
});

async function queuedJob() {
  const id = crypto.randomUUID();
  const png = new Uint8Array(24);
  png.set([137, 80, 78, 71, 13, 10, 26, 10]);
  await env.MEDIA.put(id, png);
  await env.DB.prepare(
    "INSERT INTO jobs (id,world_id,request_key,name,appearance,status,input_key,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
  )
    .bind(
      id,
      world.id,
      id,
      "Drawing",
      "handmade",
      "queued",
      id,
      "2026-09-22",
      "2026-09-22",
    )
    .run();
  return id;
}

describe("submission diagnostics", () => {
  it("stores the safe provider diagnostic instead of flattening authorization and upload failures", async () => {
    const id = await queuedJob();
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({
            detail: "private raw provider response fixture-secret",
          }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          },
        ),
    );
    await advanceJob(env, id, world, false);
    const row = await env.DB.prepare(
      "SELECT status,message FROM jobs WHERE id=?",
    )
      .bind(id)
      .first<{ status: string; message: string }>();
    expect(row).toEqual({
      status: "failed",
      message: "The owner needs to check Higgsfield API access.",
    });
  });

  it("keeps arbitrary internal exceptions private and preserves an uncertain submission", async () => {
    const id = await queuedJob();
    const brokenEnv = {
      ...env,
      MEDIA: {
        get: async () => {
          throw new Error("private storage URL fixture-secret");
        },
      },
    } as unknown as Env;
    await advanceJob(brokenEnv, id, world, false);
    const row = await env.DB.prepare(
      "SELECT status,message FROM jobs WHERE id=?",
    )
      .bind(id)
      .first<{ status: string; message: string }>();
    expect(row?.status).toBe("uncertain");
    expect(row?.message).not.toMatch(/fixture-secret|private storage URL/);
    expect(row?.message).toContain("Check your Higgsfield API activity");
  });
});
