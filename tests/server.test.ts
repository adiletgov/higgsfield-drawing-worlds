import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { encode } from "fast-png";
let mf: Miniflare;
const origin = "http://localhost";
async function request(
  path: string,
  method = "GET",
  data?: unknown,
  token?: string,
  host = origin,
) {
  return mf.dispatchFetch(host + path, {
    method,
    headers: {
      Origin: host,
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });
}
async function world() {
  return (
    await request("/api/worlds", "POST", {
      name: "The test reef",
      theme: "aquarium",
    })
  ).json() as Promise<{ id: string; guestToken: string; displayToken: string }>;
}
const input = () => {
  const data = new Uint8Array(32 * 32 * 4).fill(255);
  for (let y = 8; y < 24; y++)
    for (let x = 8; x < 24; x++) {
      let i = (y * 32 + x) * 4;
      data[i] = 20;
      data[i + 1] = 100;
      data[i + 2] = 180;
    }
  return (
    "data:image/png;base64," +
    Buffer.from(encode({ width: 32, height: 32, channels: 4, data })).toString(
      "base64",
    )
  );
};
beforeAll(async () => {
  const bundle = await build({
    entryPoints: ["src/server/index.ts"],
    bundle: true,
    format: "esm",
    platform: "browser",
    write: false,
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "worlds",
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: "2026-09-01",
      d1Databases: ["DB"],
      r2Buckets: ["MEDIA"],
      bindings: { ALLOW_LOCAL_OWNER: "true", DEMO_MODE: "true" },
      serviceBindings: {
        ASSETS: () => new Response("missing", { status: 404 }),
      },
    }),
  );
  await mf.ready;
}, 30_000);
afterAll(async () => {
  await mf?.dispose();
});
describe("persistent worlds with scoped guests", () => {
  it("denies owner routes to guests and missing identity on public hosts", async () => {
    const w = await world();
    expect(
      (
        await request(
          "/api/worlds",
          "GET",
          undefined,
          w.guestToken,
          "https://drawing.example",
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          `/api/worlds/${w.id}`,
          "PATCH",
          { name: "stolen" },
          w.guestToken,
          "https://drawing.example",
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          `/api/worlds/${w.id}`,
          "GET",
          undefined,
          undefined,
          "https://drawing.example",
        )
      ).status,
    ).toBe(403);
  });
  it("revokes the old guest link while retaining saved world and display", async () => {
    const w = await world();
    await request(`/api/worlds/${w.id}`, "PATCH", { rotateGuest: true });
    expect(
      (
        await request(
          `/api/worlds/${w.id}`,
          "GET",
          undefined,
          w.guestToken,
          "https://drawing.example",
        )
      ).status,
    ).toBe(403);
    const response = await request(
      `/api/worlds/${w.id}`,
      "GET",
      undefined,
      w.displayToken,
      "https://drawing.example",
    );
    expect(response.status).toBe(200);
    const snapshot = (await response.json()) as any;
    expect(snapshot.world.guestToken).not.toBe(w.guestToken);
    expect(snapshot.world.displayToken).toBeUndefined();
  });
  it("collapses concurrent submission retries into one job and one character", async () => {
    const w = await world(),
      payload = {
        name: "Blue friend",
        appearance: "handmade",
        requestId: crypto.randomUUID(),
        image: input(),
      };
    const responses = await Promise.all(
      Array.from({ length: 4 }, () =>
        request(`/api/worlds/${w.id}/jobs`, "POST", payload),
      ),
    );
    const jobs = (await Promise.all(responses.map((r) => r.json()))) as any[];
    expect(new Set(jobs.map((j) => j.id)).size).toBe(1);
    for (let i = 0; i < 50; i++) {
      const r = await request(`/api/worlds/${w.id}/jobs/${jobs[0].id}`);
      if (((await r.json()) as any).status === "completed") break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const db = await mf.getD1Database("DB");
    expect(
      (
        await db
          .prepare("SELECT COUNT(*) as n FROM jobs WHERE world_id=?")
          .bind(w.id)
          .first<any>()
      ).n,
    ).toBe(1);
    const snapshot = (await (
      await request(`/api/worlds/${w.id}`)
    ).json()) as any;
    expect(snapshot.characters).toHaveLength(1);
    expect(snapshot.characters[0].name).toBe("Blue friend");
    expect(
      (
        await request(
          snapshot.characters[0].assetUrl,
          "GET",
          undefined,
          undefined,
          "https://drawing.example",
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          snapshot.characters[0].assetUrl,
          "GET",
          undefined,
          w.displayToken,
          "https://drawing.example",
        )
      ).headers.get("Content-Type"),
    ).toBe("image/png");
    await request(`/api/worlds/${w.id}`, "PATCH", { uploadsOpen: false });
    expect(
      (
        await request(`/api/worlds/${w.id}/jobs`, "POST", {
          ...payload,
          requestId: crypto.randomUUID(),
        })
      ).status,
    ).toBe(403);
    const again = (await (await request(`/api/worlds/${w.id}`)).json()) as any;
    expect(again.characters).toHaveLength(1);
  });
  it("retains an ambiguous submission without calling the provider again", async () => {
    const w = await world(),
      db = await mf.getD1Database("DB"),
      id = crypto.randomUUID();
    await db
      .prepare(
        "INSERT INTO jobs(id,world_id,request_key,name,appearance,status,input_key,created_at,updated_at) VALUES(?,?,?,?,?,'submitting',?,?,?)",
      )
      .bind(
        id,
        w.id,
        crypto.randomUUID(),
        "Uncertain",
        "handmade",
        "missing-input",
        "2020-01-01",
        "2020-01-01",
      )
      .run();
    await request(`/api/worlds/${w.id}/jobs/${id}`);
    for (let i = 0; i < 30; i++) {
      const row = await db
        .prepare("SELECT status FROM jobs WHERE id=?")
        .bind(id)
        .first<any>();
      if (row.status === "uncertain") break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(
      (
        await db
          .prepare("SELECT status FROM jobs WHERE id=?")
          .bind(id)
          .first<any>()
      ).status,
    ).toBe("uncertain");
    await request(`/api/worlds/${w.id}/jobs/${id}`);
    expect(
      (
        await db
          .prepare("SELECT status FROM jobs WHERE id=?")
          .bind(id)
          .first<any>()
      ).status,
    ).toBe("uncertain");
  });
  it("fails an empty cutout without leaving a forever-processing job", async () => {
    const w = await world(),
      blank =
        "data:image/png;base64," +
        Buffer.from(
          encode({
            width: 8,
            height: 8,
            channels: 4,
            data: new Uint8Array(8 * 8 * 4).fill(255),
          }),
        ).toString("base64");
    const job = (await (
      await request(`/api/worlds/${w.id}/jobs`, "POST", {
        name: "Blank paper",
        appearance: "handmade",
        requestId: crypto.randomUUID(),
        image: blank,
      })
    ).json()) as any;
    let status = "queued";
    for (let i = 0; i < 50; i++) {
      status = (
        (await (
          await request(`/api/worlds/${w.id}/jobs/${job.id}`)
        ).json()) as any
      ).status;
      if (status === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(status).toBe("failed");
    const snapshot = (await (
      await request(`/api/worlds/${w.id}`)
    ).json()) as any;
    expect(snapshot.characters).toHaveLength(0);
  });
  it("rejects invalid metadata before storing the uploaded image", async () => {
    const w = await world(),
      bucket = await mf.getR2Bucket("MEDIA");
    const response = await request(`/api/worlds/${w.id}/jobs`, "POST", {
      name: "x".repeat(81),
      appearance: "handmade",
      requestId: crypto.randomUUID(),
      image: input(),
    });
    expect(response.status).toBe(400);
    expect(
      (await bucket.list({ prefix: `inputs/${w.id}/` })).objects,
    ).toHaveLength(0);
  });
});
