import type { PartyState } from "../shared";
import { HttpError } from "./security";

// Assign the queue position on completion, not upload: a slower earlier upload
// must not replace the drawing people are already guessing.
export function completePartyEntry(
  db: D1Database,
  worldId: string,
  jobId: string,
) {
  return [
    db
      .prepare(
        "INSERT OR IGNORE INTO party_entries(job_id,world_id) SELECT id,world_id FROM jobs WHERE id=? AND world_id=? AND EXISTS(SELECT 1 FROM worlds WHERE id=? AND theme='party')",
      )
      .bind(jobId, worldId, worldId),
    db
      .prepare(
        "UPDATE party_entries SET round=(SELECT COALESCE(MAX(round),0)+1 FROM party_entries WHERE world_id=?) WHERE job_id=? AND world_id=? AND round IS NULL AND EXISTS(SELECT 1 FROM characters WHERE id=? AND world_id=?)",
      )
      .bind(worldId, jobId, worldId, jobId, worldId),
  ];
}

/** Add existing drawings when a host changes an old world's theme to party. */
export async function prepareParty(db: D1Database, worldId: string) {
  await db
    .prepare(
      "INSERT OR IGNORE INTO party_entries(job_id,world_id) SELECT id,world_id FROM jobs WHERE world_id=?",
    )
    .bind(worldId)
    .run();
  const waiting = await db
    .prepare(
      "SELECT p.job_id FROM party_entries p JOIN characters c ON c.id=p.job_id AND c.world_id=p.world_id WHERE p.world_id=? AND p.round IS NULL ORDER BY c.created_at,c.id",
    )
    .bind(worldId)
    .all<{ job_id: string }>();
  if (waiting.results.length)
    await db.batch(
      waiting.results.map(({ job_id }) =>
        db
          .prepare(
            "UPDATE party_entries SET round=(SELECT COALESCE(MAX(round),0)+1 FROM party_entries WHERE world_id=?) WHERE job_id=? AND world_id=? AND round IS NULL",
          )
          .bind(worldId, job_id, worldId),
      ),
    );
}

export async function partyState(
  db: D1Database,
  worldId: string,
): Promise<PartyState> {
  const rows = await db
    .prepare(
      "SELECT p.job_id,p.revealed,p.advanced FROM party_entries p JOIN characters c ON c.id=p.job_id AND c.world_id=p.world_id WHERE p.world_id=? AND p.round IS NOT NULL ORDER BY p.round",
    )
    .bind(worldId)
    .all<{ job_id: string; revealed: number; advanced: number }>();
  const current = rows.results.findIndex((row) => !row.advanced);
  return {
    activeCharacterId: current < 0 ? null : rows.results[current].job_id,
    revealed: current < 0 ? false : !!rows.results[current].revealed,
    round: current < 0 ? rows.results.length : current + 1,
    total: rows.results.length,
  };
}

export async function changeParty(
  db: D1Database,
  worldId: string,
  action: "reveal" | "next",
  expectedId: string,
): Promise<PartyState> {
  // Compare-and-set against the first unfinished completed drawing in the same
  // SQL statement. Concurrent Next clicks cannot advance two different rounds.
  const update = await db
    .prepare(
      `UPDATE party_entries SET ${action === "reveal" ? "revealed=1" : "advanced=1"}
     WHERE world_id=? AND job_id=? ${action === "next" ? "AND revealed=1" : ""}
     AND job_id=(SELECT p.job_id FROM party_entries p JOIN characters c ON c.id=p.job_id AND c.world_id=p.world_id
       WHERE p.world_id=? AND p.round IS NOT NULL AND p.advanced=0 ORDER BY p.round LIMIT 1)`,
    )
    .bind(worldId, expectedId, worldId)
    .run();
  if (update.meta.changes !== 1) {
    const previous = await db
      .prepare(
        "SELECT revealed,advanced FROM party_entries WHERE job_id=? AND world_id=?",
      )
      .bind(expectedId, worldId)
      .first<{ revealed: number; advanced: number }>();
    // An already-applied action is harmless to repeat, even after the next round.
    if (
      !previous ||
      !(action === "reveal" ? previous.revealed : previous.advanced)
    )
      throw new HttpError(
        409,
        action === "next"
          ? "Reveal the current drawing before moving on. Refresh if the round changed."
          : "This round changed. Refresh before revealing the current drawing.",
      );
  }
  return partyState(db, worldId);
}
