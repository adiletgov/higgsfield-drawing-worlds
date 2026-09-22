import type { Env } from "./env";
import type { Job, World } from "../shared";
import { initialize, type WorldRow, type JobRow } from "./database";
import { advanceJob } from "./jobs";
import { checkProviderConnection } from "./provider";
import { validateUpload } from "./images";
import { changeParty, partyState, prepareParty } from "./party";
import {
  HttpError,
  bearer,
  isOwner,
  isLocal,
  requireSameOrigin,
  requireOwner,
  secureEqual,
  securityHeaders,
  token,
} from "./security";
const themes = ["aquarium", "dinosaur", "space", "party"];
const appearances = ["handmade", "polished"];
type VisibleJobRow = JobRow & { party_revealed: number | null };
const jobSelection =
  "SELECT j.*, p.revealed AS party_revealed FROM jobs j LEFT JOIN party_entries p ON p.job_id=j.id AND p.world_id=j.world_id";
function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
function worldView(w: WorldRow, owner = false): World {
  return {
    id: w.id,
    name: w.name,
    theme: w.theme as World["theme"],
    uploadsOpen: !!w.uploads_open,
    createdAt: w.created_at,
    guestToken: w.guest_token,
    ...(owner ? { displayToken: w.display_token } : {}),
  };
}
function jobView(j: JobRow, hidden = false): Job {
  return {
    id: j.id,
    name: hidden ? "Mystery guest" : j.name,
    status: j.status as Job["status"],
    message: j.message ?? undefined,
    createdAt: j.created_at,
  };
}
function name(value: unknown, fallback = "My world") {
  if (typeof value !== "string") return fallback;
  const text = value.trim();
  if (!text || text.length > 80)
    throw new HttpError(400, "Use a name between 1 and 80 characters.");
  return text;
}
async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new HttpError(415, "Send this request from the upload page.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "The request is empty.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 18 * 1024 * 1024) {
      await reader.cancel();
      throw new HttpError(413, "Choose a smaller photo.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error();
    return parsed;
  } catch {
    throw new HttpError(
      400,
      "This request could not be read. Please try again.",
    );
  }
}
async function api(request: Request, env: Env, ctx: ExecutionContext) {
  const url = new URL(request.url),
    parts = url.pathname.split("/").filter(Boolean),
    owner = isOwner(request, env),
    demo = isLocal(request) && env.DEMO_MODE === "true";
  requireSameOrigin(request);
  if (url.pathname === "/api/session" && request.method === "GET")
    return json({
      owner,
      configured:
        !!env.OWNER_EMAIL ||
        (isLocal(request) && env.ALLOW_LOCAL_OWNER === "true"),
      generationReady:
        demo || !!(env.HIGGSFIELD_API_KEY && env.HIGGSFIELD_API_SECRET),
      demo,
      signInUrl: "/signin-with-chatgpt",
    });
  if (url.pathname === "/api/connection-check" && request.method === "GET") {
    requireOwner(request, env);
    return json(
      await checkProviderConnection({
        HIGGSFIELD_API_KEY: env.HIGGSFIELD_API_KEY ?? "",
        HIGGSFIELD_API_SECRET: env.HIGGSFIELD_API_SECRET ?? "",
      }),
    );
  }
  if (!env.DB || !env.MEDIA)
    throw new HttpError(
      503,
      "This site needs its saved-world storage connected.",
    );
  await initialize(env.DB);
  if (parts[1] !== "worlds")
    throw new HttpError(404, "This page could not be found.");
  if (parts.length === 2) {
    requireOwner(request, env);
    if (request.method === "GET") {
      const rows = await env.DB.prepare(
        "SELECT * FROM worlds ORDER BY created_at DESC",
      ).all<WorldRow>();
      return json({ worlds: rows.results.map((w) => worldView(w, true)) });
    }
    if (request.method === "POST") {
      const data = await body(request);
      if (!themes.includes(String(data.theme)))
        throw new HttpError(400, "Choose a world.");
      const row: WorldRow = {
        id: crypto.randomUUID(),
        name: name(data.name),
        theme: String(data.theme),
        uploads_open: 1,
        guest_token: token(),
        display_token: token(),
        created_at: new Date().toISOString(),
      };
      await env.DB.prepare(
        "INSERT INTO worlds (id,name,theme,uploads_open,guest_token,display_token,created_at) VALUES (?,?,?,?,?,?,?)",
      )
        .bind(
          row.id,
          row.name,
          row.theme,
          1,
          row.guest_token,
          row.display_token,
          row.created_at,
        )
        .run();
      return json(worldView(row, true), 201);
    }
    throw new HttpError(405, "This action is not available.");
  }
  const world = await env.DB.prepare("SELECT * FROM worlds WHERE id=?")
    .bind(parts[2])
    .first<WorldRow>();
  if (!world) throw new HttpError(404, "This world could not be found.");
  const access = bearer(request),
    guest = !!access && secureEqual(access, world.guest_token),
    display = !!access && secureEqual(access, world.display_token);
  if (!owner && !guest && !display)
    throw new HttpError(
      403,
      "This link has expired or is incomplete. Ask the owner for a new link.",
    );
  if (world.theme === "party") await prepareParty(env.DB, world.id);
  // Fetch each answer's visibility in the same query as its response row.
  const hidden = (revealed: number | null) =>
    revealed === 0 || (world.theme === "party" && revealed !== 1);
  const viewJob = (job: VisibleJobRow) =>
    jobView(job, hidden(job.party_revealed));
  if (
    parts[3] === "party" &&
    parts.length === 4 &&
    request.method === "PATCH"
  ) {
    requireOwner(request, env);
    if (world.theme !== "party")
      throw new HttpError(400, "Choose a party world to play rounds.");
    const data = await body(request);
    if (
      (data.action !== "reveal" && data.action !== "next") ||
      typeof data.activeCharacterId !== "string" ||
      !/^[a-f0-9-]{36}$/i.test(data.activeCharacterId)
    )
      throw new HttpError(400, "Choose an action for the current drawing.");
    return json(
      await changeParty(env.DB, world.id, data.action, data.activeCharacterId),
    );
  }
  if (parts.length === 3) {
    if (request.method === "PATCH") {
      requireOwner(request, env);
      const data = await body(request);
      if (data.theme !== undefined && !themes.includes(String(data.theme)))
        throw new HttpError(400, "Choose a world.");
      if (
        data.uploadsOpen !== undefined &&
        typeof data.uploadsOpen !== "boolean"
      )
        throw new HttpError(400, "Choose whether uploads are open.");
      if (data.name !== undefined) world.name = name(data.name);
      if (data.theme !== undefined) world.theme = String(data.theme);
      if (data.uploadsOpen !== undefined)
        world.uploads_open = data.uploadsOpen ? 1 : 0;
      if (data.rotateGuest === true) world.guest_token = token();
      await env.DB.prepare(
        "UPDATE worlds SET name=?,theme=?,uploads_open=?,guest_token=? WHERE id=?",
      )
        .bind(
          world.name,
          world.theme,
          world.uploads_open,
          world.guest_token,
          world.id,
        )
        .run();
      if (world.theme === "party") await prepareParty(env.DB, world.id);
      return json(worldView(world, true));
    }
    if (request.method !== "GET")
      throw new HttpError(405, "This action is not available.");
    const pending = await env.DB.prepare(
      "SELECT id FROM jobs WHERE world_id=? AND status IN ('queued','submitting','processing') ORDER BY updated_at ASC LIMIT 3",
    )
      .bind(world.id)
      .all<{ id: string }>();
    ctx.waitUntil(
      Promise.allSettled(
        pending.results.map((j) => advanceJob(env, j.id, world, demo)),
      ).then(() => {}),
    );
    const characters = await env.DB.prepare(
      "SELECT c.id,c.name,c.appearance,c.created_at,p.revealed AS party_revealed FROM characters c LEFT JOIN party_entries p ON p.job_id=c.id AND p.world_id=c.world_id WHERE c.world_id=? ORDER BY c.created_at,c.id",
    )
      .bind(world.id)
      .all<{
        id: string;
        name: string;
        appearance: string;
        created_at: string;
        party_revealed: number | null;
      }>();
    const jobs = await env.DB.prepare(
      `${jobSelection} WHERE j.world_id=? AND j.status != 'completed' ORDER BY j.created_at DESC`,
    )
      .bind(world.id)
      .all<VisibleJobRow>();
    return json({
      world: worldView(world, owner),
      characters: characters.results.map((c) => ({
        id: c.id,
        name: hidden(c.party_revealed) ? "Mystery guest" : c.name,
        appearance: c.appearance,
        createdAt: c.created_at,
        assetUrl: `/api/worlds/${world.id}/assets/${c.id}`,
      })),
      jobs: jobs.results.map(viewJob),
      ...(world.theme === "party"
        ? { party: await partyState(env.DB, world.id) }
        : {}),
    });
  }
  if (parts[3] === "jobs") {
    if (parts.length === 5 && request.method === "PATCH") {
      requireOwner(request, env);
      const data = await body(request);
      if (data.resolveUncertain !== true)
        throw new HttpError(400, "Confirm that you reviewed this upload.");
      const row = await env.DB.prepare(
        `${jobSelection} WHERE j.id=? AND j.world_id=?`,
      )
        .bind(parts[4], world.id)
        .first<VisibleJobRow>();
      if (!row) throw new HttpError(404, "This upload could not be found.");
      if (row.status !== "uncertain")
        throw new HttpError(
          409,
          "This upload no longer needs review. Refresh its status.",
        );
      await env.DB.prepare(
        "UPDATE jobs SET status='failed',message=?,updated_at=? WHERE id=? AND status='uncertain'",
      )
        .bind(
          "The host reviewed this upload and closed tracking. You can choose another drawing. A new upload starts a new generation.",
          new Date().toISOString(),
          row.id,
        )
        .run();
      await env.MEDIA.delete(row.input_key);
      const updated = await env.DB.prepare(`${jobSelection} WHERE j.id=?`)
        .bind(row.id)
        .first<VisibleJobRow>();
      return json(viewJob(updated!));
    }
    if (
      parts.length === 6 &&
      parts[4] === "request" &&
      request.method === "GET"
    ) {
      const row = await env.DB.prepare(
        `${jobSelection} WHERE j.request_key=? AND j.world_id=?`,
      )
        .bind(parts[5], world.id)
        .first<VisibleJobRow>();
      if (!row)
        throw new HttpError(404, "This drawing has not been received yet.");
      ctx.waitUntil(advanceJob(env, row.id, world, demo));
      return json(viewJob(row));
    }
    if (parts.length === 5 && request.method === "GET") {
      const row = await env.DB.prepare(
        `${jobSelection} WHERE j.id=? AND j.world_id=?`,
      )
        .bind(parts[4], world.id)
        .first<VisibleJobRow>();
      if (!row) throw new HttpError(404, "This drawing could not be found.");
      ctx.waitUntil(advanceJob(env, row.id, world, demo));
      return json(viewJob(row));
    }
    if (parts.length === 4 && request.method === "POST") {
      if (!owner && !guest)
        throw new HttpError(403, "Use the upload link to add a drawing.");
      const data = await body(request);
      if (
        typeof data.requestId !== "string" ||
        !/^[a-f0-9-]{36}$/i.test(data.requestId)
      )
        throw new HttpError(
          400,
          "Please refresh the upload page and try again.",
        );
      const existing = await env.DB.prepare(
        `${jobSelection} WHERE j.world_id=? AND j.request_key=?`,
      )
        .bind(world.id, data.requestId)
        .first<VisibleJobRow>();
      if (existing) return json(viewJob(existing));
      if (!world.uploads_open)
        throw new HttpError(
          403,
          "Uploads are paused for this world. Please try again later.",
        );
      if (!demo && (!env.HIGGSFIELD_API_KEY || !env.HIGGSFIELD_API_SECRET))
        throw new HttpError(
          503,
          "The owner needs to connect Higgsfield API before drawings can come alive.",
        );
      if (!appearances.includes(String(data.appearance)))
        throw new HttpError(400, "Choose handmade or polished.");
      if (world.theme === "party" && typeof data.name !== "string")
        throw new HttpError(
          400,
          "Enter the name to reveal after everyone guesses.",
        );
      const characterName = name(data.name, "New friend"),
        image = validateUpload(data.image),
        id = crypto.randomUUID(),
        key = `inputs/${world.id}/${id}.png`,
        now = new Date().toISOString();
      await env.MEDIA.put(key, image, {
        httpMetadata: { contentType: "image/png" },
      });
      let insert: D1Result;
      try {
        const inserted = await env.DB.batch([
          env.DB.prepare(
            "INSERT OR IGNORE INTO jobs (id,world_id,request_key,name,appearance,status,input_key,created_at,updated_at) VALUES (?,?,?,?,?,'queued',?,?,?)",
          ).bind(
            id,
            world.id,
            data.requestId,
            characterName,
            String(data.appearance),
            key,
            now,
            now,
          ),
          env.DB.prepare(
            "INSERT OR IGNORE INTO party_entries(job_id,world_id) SELECT id,world_id FROM jobs WHERE world_id=? AND request_key=? AND (?='party' OR EXISTS(SELECT 1 FROM worlds WHERE id=? AND theme='party'))",
          ).bind(world.id, data.requestId, world.theme, world.id),
        ]);
        insert = inserted[0];
      } catch (error) {
        await env.MEDIA.delete(key);
        throw error;
      }
      if (insert.meta.changes !== 1) await env.MEDIA.delete(key);
      const row = await env.DB.prepare(
        `${jobSelection} WHERE j.world_id=? AND j.request_key=?`,
      )
        .bind(world.id, data.requestId)
        .first<VisibleJobRow>();
      if (!row)
        throw new HttpError(
          503,
          "The drawing could not be saved. Please try again.",
        );
      ctx.waitUntil(advanceJob(env, row.id, world, demo));
      return json(viewJob(row), 202);
    }
  }
  if (
    parts[3] === "characters" &&
    parts.length === 5 &&
    request.method === "DELETE"
  ) {
    requireOwner(request, env);
    const row = await env.DB.prepare(
      "SELECT asset_key FROM characters WHERE id=? AND world_id=?",
    )
      .bind(parts[4], world.id)
      .first<{ asset_key: string }>();
    if (!row)
      throw new HttpError(404, "This character has already been removed.");
    await env.DB.prepare("DELETE FROM characters WHERE id=? AND world_id=?")
      .bind(parts[4], world.id)
      .run();
    await env.MEDIA.delete(row.asset_key);
    return json({ ok: true });
  }
  if (parts[3] === "assets" && parts.length === 5 && request.method === "GET") {
    const row = await env.DB.prepare(
      "SELECT asset_key FROM characters WHERE id=? AND world_id=?",
    )
      .bind(parts[4], world.id)
      .first<{ asset_key: string }>();
    if (!row) throw new HttpError(404, "This character is unavailable.");
    const asset = await env.MEDIA.get(row.asset_key);
    if (!asset) throw new HttpError(404, "This character is unavailable.");
    return new Response(asset.body, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, no-store",
      },
    });
  }
  throw new HttpError(404, "This action could not be found.");
}
export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    let response: Response;
    try {
      if (new URL(request.url).pathname.startsWith("/api/"))
        response = await api(request, env, ctx);
      else {
        response = await env.ASSETS.fetch(request);
        if (
          response.status === 404 &&
          ["GET", "HEAD"].includes(request.method) &&
          request.headers.get("accept")?.includes("text/html")
        ) {
          const url = new URL(request.url);
          url.pathname = "/";
          url.search = "";
          response = await env.ASSETS.fetch(new Request(url, request));
        }
      }
    } catch (error) {
      response = json(
        {
          error:
            error instanceof HttpError
              ? error.message
              : "Something went wrong. Your saved world is safe. Please try again.",
        },
        error instanceof HttpError ? error.status : 500,
      );
    }
    const secured = new Response(response.body, response);
    for (const [key, value] of Object.entries(securityHeaders))
      secured.headers.set(key, value);
    return secured;
  },
};
