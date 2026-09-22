import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { encode } from "fast-png";
import { generationPrompt } from "../src/server/jobs";
import { completePartyEntry } from "../src/server/party";

let mf: Miniflare;
const publicOrigin = "https://drawing.example";
async function request(
  path: string,
  method = "GET",
  data?: unknown,
  token?: string,
) {
  const origin = token ? publicOrigin : "http://localhost";
  return mf.dispatchFetch(origin + path, {
    method,
    headers: {
      Origin: origin,
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });
}
async function world(theme = "party") {
  const response = await request("/api/worlds", "POST", {
    name: "Friday party",
    theme,
  });
  expect(response.status).toBe(201);
  return (await response.json()) as {
    id: string;
    guestToken: string;
    displayToken: string;
  };
}
function image() {
  const data = new Uint8Array(32 * 32 * 4).fill(255);
  for (let y = 8; y < 24; y++)
    for (let x = 8; x < 24; x++) {
      const i = (y * 32 + x) * 4;
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
}
async function drawing(worldId: string, name: string) {
  const payload = {
    name,
    appearance: "handmade",
    requestId: crypto.randomUUID(),
    image: image(),
  };
  const response = await request(
    `/api/worlds/${worldId}/jobs`,
    "POST",
    payload,
  );
  expect(response.status).toBe(202);
  const job = (await response.json()) as any;
  for (let i = 0; i < 60; i++) {
    const current = (await (
      await request(`/api/worlds/${worldId}/jobs/${job.id}`)
    ).json()) as any;
    if (current.status === "completed") return { job, payload };
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Local demo drawing did not complete");
}
async function snapshot(id: string, token?: string) {
  return (await (
    await request(`/api/worlds/${id}`, "GET", undefined, token)
  ).json()) as any;
}
async function action(
  id: string,
  activeCharacterId: string,
  action: "reveal" | "next",
  token?: string,
) {
  return request(
    `/api/worlds/${id}/party`,
    "PATCH",
    { activeCharacterId, action },
    token,
  );
}
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
      name: "party-tests",
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

describe("party guessing rounds", () => {
  it("hides the answer from every job and character response until its reveal, including the owner", async () => {
    const w = await world(),
      secret = "Answer Only For Reveal",
      { job, payload } = await drawing(w.id, secret);
    expect(job.name).toBe("Mystery guest");
    for (const token of [undefined, w.guestToken, w.displayToken]) {
      for (const path of [
        `/api/worlds/${w.id}`,
        `/api/worlds/${w.id}/jobs/${job.id}`,
        `/api/worlds/${w.id}/jobs/request/${payload.requestId}`,
      ]) {
        const response = await request(path, "GET", undefined, token);
        expect(response.status).toBe(200);
        expect(await response.text()).not.toContain(secret);
      }
    }
    const repeated = await request(
      `/api/worlds/${w.id}/jobs`,
      "POST",
      payload,
      w.guestToken,
    );
    expect(((await repeated.json()) as any).name).toBe("Mystery guest");
    const before = await snapshot(w.id, w.displayToken);
    expect(before.party).toEqual({
      activeCharacterId: job.id,
      revealed: false,
      round: 1,
      total: 1,
    });
    expect(before.characters[0].name).toBe("Mystery guest");
    expect((await action(w.id, job.id, "reveal")).status).toBe(200);
    const after = await snapshot(w.id, w.displayToken);
    expect(after.party.revealed).toBe(true);
    expect(after.characters[0].name).toBe(secret);
    expect(
      (
        (await (
          await request(
            `/api/worlds/${w.id}/jobs/${job.id}`,
            "GET",
            undefined,
            w.guestToken,
          )
        ).json()) as any
      ).name,
    ).toBe(secret);
  });

  it("queues completions, refuses skipping, and makes repeated or concurrent controls safe", async () => {
    const w = await world(),
      a = await drawing(w.id, "First secret"),
      b = await drawing(w.id, "Second secret"),
      c = await drawing(w.id, "Third secret");
    expect((await snapshot(w.id)).party).toEqual({
      activeCharacterId: a.job.id,
      revealed: false,
      round: 1,
      total: 3,
    });
    expect((await action(w.id, a.job.id, "next")).status).toBe(409);
    expect((await action(w.id, b.job.id, "reveal")).status).toBe(409);
    await action(w.id, a.job.id, "reveal");
    await action(w.id, a.job.id, "reveal");
    const advances = await Promise.all([
      action(w.id, a.job.id, "next"),
      action(w.id, a.job.id, "next"),
    ]);
    expect(advances.map((r) => r.status)).toEqual([200, 200]);
    const second = await snapshot(w.id);
    expect(second.party).toEqual({
      activeCharacterId: b.job.id,
      revealed: false,
      round: 2,
      total: 3,
    });
    expect(second.characters.map((x: any) => x.name)).toEqual([
      "First secret",
      "Mystery guest",
      "Mystery guest",
    ]);
    expect((await action(w.id, a.job.id, "reveal")).status).toBe(200);
    expect((await snapshot(w.id)).party.revealed).toBe(false);
    await action(w.id, b.job.id, "reveal");
    await action(w.id, b.job.id, "next");
    expect((await snapshot(w.id)).party.activeCharacterId).toBe(c.job.id);
  });

  it("persists reveal history, empties at the end, and activates a later drawing", async () => {
    const w = await world();
    expect((await snapshot(w.id)).party).toEqual({
      activeCharacterId: null,
      revealed: false,
      round: 0,
      total: 0,
    });
    const a = await drawing(w.id, "Already revealed");
    await action(w.id, a.job.id, "reveal");
    await action(w.id, a.job.id, "next");
    expect((await snapshot(w.id, w.displayToken)).party).toEqual({
      activeCharacterId: null,
      revealed: false,
      round: 1,
      total: 1,
    });
    const b = await drawing(w.id, "Still hidden");
    const later = await snapshot(w.id, w.guestToken);
    expect(later.party).toEqual({
      activeCharacterId: b.job.id,
      revealed: false,
      round: 2,
      total: 2,
    });
    expect(later.characters.map((x: any) => x.name)).toEqual([
      "Already revealed",
      "Mystery guest",
    ]);
  });

  it("restricts controls to the owner and the same origin", async () => {
    const w = await world(),
      a = await drawing(w.id, "Hidden subject");
    for (const token of [w.guestToken, w.displayToken]) {
      expect((await action(w.id, a.job.id, "reveal", token)).status).toBe(403);
      expect(
        (
          await request(
            `/api/worlds/${w.id}/characters/${a.job.id}`,
            "DELETE",
            undefined,
            token,
          )
        ).status,
      ).toBe(403);
    }
    const cross = await mf.dispatchFetch(
      `http://localhost/api/worlds/${w.id}/party`,
      {
        method: "PATCH",
        headers: {
          Origin: "https://other.example",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "reveal", activeCharacterId: a.job.id }),
      },
    );
    expect(cross.status).toBe(403);
    expect((await snapshot(w.id)).party.revealed).toBe(false);
  });

  it("lets the host remove an unrevealed current drawing without exposing or blocking later rounds", async () => {
    const w = await world(),
      a = await drawing(w.id, "Removed secret"),
      b = await drawing(w.id, "Next secret");
    expect(
      (await request(`/api/worlds/${w.id}/characters/${a.job.id}`, "DELETE"))
        .status,
    ).toBe(200);
    const next = await snapshot(w.id, w.displayToken);
    expect(next.party).toEqual({
      activeCharacterId: b.job.id,
      revealed: false,
      round: 1,
      total: 1,
    });
    expect(JSON.stringify(next)).not.toContain("Removed secret");
    expect(
      (
        (await (
          await request(`/api/worlds/${w.id}/jobs/${a.job.id}`)
        ).json()) as any
      ).name,
    ).toBe("Mystery guest");
    expect(
      (await request(`/api/worlds/${w.id}/characters/${b.job.id}`, "DELETE"))
        .status,
    ).toBe(200);
    expect((await snapshot(w.id)).party.activeCharacterId).toBeNull();
  });

  it("preserves legacy world behavior and keeps party secrets hidden across theme changes", async () => {
    const old = await world("aquarium"),
      fish = await drawing(old.id, "Blue fish");
    expect((await snapshot(old.id)).characters[0].name).toBe("Blue fish");
    expect(await snapshot(old.id)).not.toHaveProperty("party");
    const party = await world(),
      hidden = await drawing(party.id, "Hidden after theme change");
    await request(`/api/worlds/${party.id}`, "PATCH", { theme: "space" });
    expect(JSON.stringify(await snapshot(party.id))).not.toContain(
      "Hidden after theme change",
    );
    expect(
      (
        (await (
          await request(`/api/worlds/${party.id}/jobs/${hidden.job.id}`)
        ).json()) as any
      ).name,
    ).toBe("Mystery guest");
    await request(`/api/worlds/${party.id}`, "PATCH", { theme: "party" });
    expect((await snapshot(party.id)).party.activeCharacterId).toBe(
      hidden.job.id,
    );
    expect(fish.job.id).toBeTruthy();
  });

  it("uses an adult caricature prompt without guessing identity or accepting a subject-name input", () => {
    const prompt = generationPrompt("party", "handmade");
    expect(prompt).toContain("adult");
    expect(prompt).toContain("caricature");
    expect(prompt).toContain("Do not guess");
    expect(prompt).toContain("pencil/crayon texture");
    expect(prompt).not.toMatch(/child|kid|baby/i);
  });

  it("keeps the first completed drawing active when an earlier upload completes later", async () => {
    const w = await world(),
      db = await mf.getD1Database("DB");
    const early = crypto.randomUUID(),
      fast = crypto.randomUUID();
    for (const [id, created] of [
      [early, "2020-01-01"],
      [fast, "2020-01-02"],
    ]) {
      await db
        .prepare(
          "INSERT INTO jobs(id,world_id,request_key,name,appearance,status,input_key,created_at,updated_at) VALUES(?,?,?,?,'handmade','processing','unused',?,?)",
        )
        .bind(
          id,
          w.id,
          crypto.randomUUID(),
          "Hidden completion name",
          created,
          created,
        )
        .run();
    }
    async function complete(id: string) {
      await db.batch([
        db
          .prepare(
            "INSERT INTO characters(id,world_id,name,appearance,asset_key,created_at) VALUES(?,?,?,'handmade','unused',?)",
          )
          .bind(id, w.id, "Hidden completion name", new Date().toISOString()),
        db.prepare("UPDATE jobs SET status='completed' WHERE id=?").bind(id),
        ...(completePartyEntry(db as unknown as D1Database, w.id, id) as any[]),
      ]);
    }
    await complete(fast);
    expect((await snapshot(w.id)).party.activeCharacterId).toBe(fast);
    await complete(early);
    expect((await snapshot(w.id)).party).toEqual({
      activeCharacterId: fast,
      revealed: false,
      round: 1,
      total: 2,
    });
    await action(w.id, fast, "reveal");
    await action(w.id, fast, "next");
    expect((await snapshot(w.id)).party.activeCharacterId).toBe(early);
  });

  it("redacts failed and uncertain jobs, including the owner's resolution response", async () => {
    const w = await world(),
      db = await mf.getD1Database("DB"),
      uncertain = crypto.randomUUID();
    for (const [id, status] of [
      [crypto.randomUUID(), "failed"],
      [uncertain, "uncertain"],
    ]) {
      await db
        .prepare(
          "INSERT INTO jobs(id,world_id,request_key,name,appearance,status,input_key,created_at,updated_at) VALUES(?,?,?,?,'handmade',?,'unused','2020-01-01','2020-01-01')",
        )
        .bind(id, w.id, crypto.randomUUID(), "Failed answer secret", status)
        .run();
    }
    expect(JSON.stringify(await snapshot(w.id, w.displayToken))).not.toContain(
      "Failed answer secret",
    );
    const resolved = await request(
      `/api/worlds/${w.id}/jobs/${uncertain}`,
      "PATCH",
      { resolveUncertain: true },
    );
    expect(resolved.status).toBe(200);
    expect(((await resolved.json()) as any).name).toBe("Mystery guest");
    const other = await world();
    expect((await action(other.id, uncertain, "reveal")).status).toBe(409);
    expect(
      (
        await request(
          `/api/worlds/${other.id}/jobs/${uncertain}`,
          "GET",
          undefined,
          other.guestToken,
        )
      ).status,
    ).toBe(404);
  });

  it.each([undefined, null, 123, {}, "", " "])(
    "requires a valid party answer %j before saving an upload",
    async (name) => {
      const w = await world();
      const response = await request(`/api/worlds/${w.id}/jobs`, "POST", {
        name,
        appearance: "handmade",
        requestId: crypto.randomUUID(),
        image: image(),
      });
      expect(response.status).toBe(400);
      const bucket = await mf.getR2Bucket("MEDIA");
      expect(
        (await bucket.list({ prefix: `inputs/${w.id}/` })).objects,
      ).toHaveLength(0);
      const db = await mf.getD1Database("DB");
      expect(
        await db
          .prepare("SELECT COUNT(*) AS total FROM jobs WHERE world_id=?")
          .bind(w.id)
          .first(),
      ).toEqual({ total: 0 });
    },
  );

  it("serves completed video and poster only to this world's viewers and removes both during moderation", async () => {
    const w = await world(),
      other = await world(),
      id = crypto.randomUUID();
    const db = await mf.getD1Database("DB"),
      bucket = await mf.getR2Bucket("MEDIA");
    const videoKey = `characters/${w.id}/${id}.mp4`,
      posterKey = `posters/${w.id}/${id}.png`;
    const video = new Uint8Array([
      0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0, 105, 115,
      111, 109, 109, 112, 52, 50,
    ]);
    const poster = Uint8Array.from(Buffer.from(image().slice(22), "base64"));
    await bucket.put(videoKey, video);
    await bucket.put(posterKey, poster);
    await db.batch([
      db
        .prepare(
          "INSERT INTO jobs(id,world_id,request_key,name,appearance,status,input_key,created_at,updated_at) VALUES(?,?,?,'Animated secret','animated','completed','unused','2026-01-01','2026-01-01')",
        )
        .bind(id, w.id, id),
      db
        .prepare(
          "INSERT INTO animation_jobs(job_id,world_id,phase,poster_key) VALUES(?,?,'animating',?)",
        )
        .bind(id, w.id, posterKey),
      db
        .prepare(
          "INSERT INTO characters(id,world_id,name,appearance,asset_key,created_at) VALUES(?,?,'Animated secret','animated',?,'2026-01-01')",
        )
        .bind(id, w.id, videoKey),
    ]);
    const snap = await snapshot(w.id, w.displayToken),
      character = snap.characters[0];
    expect(character).toMatchObject({
      id,
      name: "Mystery guest",
      mediaType: "video",
      posterUrl: `/api/worlds/${w.id}/posters/${id}`,
    });
    for (const [path, mime, expected] of [
      [character.assetUrl, "video/mp4", video],
      [character.posterUrl, "image/png", poster],
    ] as const) {
      const response = await request(path, "GET", undefined, w.displayToken);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(mime);
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(expected);
      expect(
        (await request(path, "GET", undefined, other.guestToken)).status,
      ).toBe(403);
      expect((await mf.dispatchFetch(publicOrigin + path)).status).toBe(403);
    }
    await request(`/api/worlds/${w.id}`, "PATCH", { theme: "space" });
    expect((await snapshot(w.id)).characters[0]).toMatchObject({
      mediaType: "video",
      posterUrl: character.posterUrl,
      name: "Mystery guest",
    });
    expect(
      (await request(`/api/worlds/${w.id}/characters/${id}`, "DELETE")).status,
    ).toBe(200);
    expect(await bucket.get(videoKey)).toBeNull();
    expect(await bucket.get(posterKey)).toBeNull();
    expect(
      (await request(character.posterUrl, "GET", undefined, w.displayToken))
        .status,
    ).toBe(404);
  });

  it("exposes animation phase without its answer and fails safely in demo mode", async () => {
    const w = await world(),
      payload = {
        name: "Demo hidden answer",
        appearance: "animated",
        requestId: crypto.randomUUID(),
        image: image(),
      };
    const created = await request(`/api/worlds/${w.id}/jobs`, "POST", payload);
    expect(created.status).toBe(202);
    const job = (await created.json()) as any;
    expect(job).toMatchObject({
      name: "Mystery guest",
      appearance: "animated",
      phase: "illustrating",
    });
    let current = job;
    for (let i = 0; i < 60 && current.status !== "failed"; i++) {
      current = await (
        await request(`/api/worlds/${w.id}/jobs/${job.id}`)
      ).json();
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(current).toMatchObject({
      status: "failed",
      name: "Mystery guest",
      phase: "illustrating",
    });
    expect(current.message).toContain("Demo mode does not generate video");
    expect((await snapshot(w.id)).characters).toHaveLength(0);
    const legacy = await world("aquarium");
    expect(
      (await request(`/api/worlds/${legacy.id}/jobs`, "POST", payload)).status,
    ).toBe(400);
    const db = await mf.getD1Database("DB");
    expect(
      await db
        .prepare("SELECT COUNT(*) AS total FROM jobs WHERE world_id=?")
        .bind(legacy.id)
        .first(),
    ).toEqual({ total: 0 });
  });

  it.each(
    [["animated"], ["handmade"], { value: "animated" }, null, 1].map(
      (appearance) => ({ appearance }),
    ),
  )(
    "rejects malformed appearance %j without writing a job or media",
    async ({ appearance }) => {
      for (const theme of ["aquarium", "party"]) {
        const w = await world(theme);
        const response = await request(`/api/worlds/${w.id}/jobs`, "POST", {
          name: "Secret answer",
          appearance,
          requestId: crypto.randomUUID(),
          image: image(),
        });
        expect(response.status).toBe(400);
        const db = await mf.getD1Database("DB"),
          bucket = await mf.getR2Bucket("MEDIA");
        expect(
          await db
            .prepare("SELECT COUNT(*) AS total FROM jobs WHERE world_id=?")
            .bind(w.id)
            .first(),
        ).toEqual({ total: 0 });
        expect(
          (await bucket.list({ prefix: `inputs/${w.id}/` })).objects,
        ).toHaveLength(0);
      }
    },
  );
});
