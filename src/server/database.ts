export interface WorldRow {
  id: string;
  name: string;
  theme: string;
  uploads_open: number;
  guest_token: string;
  display_token: string;
  created_at: string;
}
export interface JobRow {
  id: string;
  world_id: string;
  request_key: string;
  name: string;
  appearance: string;
  status: string;
  provider_id: string | null;
  message: string | null;
  input_key: string;
  created_at: string;
  updated_at: string;
  lease_until: number;
}
const initialized = new WeakMap<D1Database, Promise<void>>();
export function initialize(db: D1Database) {
  let promise = initialized.get(db);
  if (!promise) {
    promise = (async () => {
      await db.batch([
        db.prepare(
          "CREATE TABLE IF NOT EXISTS worlds (id TEXT PRIMARY KEY, name TEXT NOT NULL, theme TEXT NOT NULL, uploads_open INTEGER NOT NULL DEFAULT 1, guest_token TEXT NOT NULL, display_token TEXT NOT NULL, created_at TEXT NOT NULL)",
        ),
        db.prepare(
          "CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, world_id TEXT NOT NULL REFERENCES worlds(id), request_key TEXT NOT NULL, name TEXT NOT NULL, appearance TEXT NOT NULL, status TEXT NOT NULL, provider_id TEXT, message TEXT, input_key TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, lease_until INTEGER NOT NULL DEFAULT 0, UNIQUE(world_id, request_key))",
        ),
        db.prepare(
          "CREATE TABLE IF NOT EXISTS characters (id TEXT PRIMARY KEY, world_id TEXT NOT NULL REFERENCES worlds(id), name TEXT NOT NULL, appearance TEXT NOT NULL, asset_key TEXT NOT NULL, created_at TEXT NOT NULL)",
        ),
        db.prepare(
          "CREATE INDEX IF NOT EXISTS jobs_world_status ON jobs(world_id, status)",
        ),
        db.prepare(
          "CREATE INDEX IF NOT EXISTS characters_world ON characters(world_id)",
        ),
        db.prepare(
          "CREATE TABLE IF NOT EXISTS party_entries (job_id TEXT PRIMARY KEY, world_id TEXT NOT NULL REFERENCES worlds(id), round INTEGER, revealed INTEGER NOT NULL DEFAULT 0, advanced INTEGER NOT NULL DEFAULT 0, UNIQUE(world_id, round))",
        ),
        db.prepare(
          "CREATE TABLE IF NOT EXISTS animation_jobs (job_id TEXT PRIMARY KEY REFERENCES jobs(id), world_id TEXT NOT NULL REFERENCES worlds(id), phase TEXT NOT NULL, poster_key TEXT, image_provider_id TEXT, video_provider_id TEXT)",
        ),
      ]);
    })().catch((e) => {
      initialized.delete(db);
      throw e;
    });
    initialized.set(db, promise);
  }
  return promise;
}
