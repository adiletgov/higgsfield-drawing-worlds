import type { Env } from "./env";
import type { JobRow } from "./database";
import { normalizeImage } from "./images";
import { completePartyEntry } from "./party";
import { HttpError } from "./security";
import {
  submitGeneration,
  pollGeneration,
  fetchResultImage,
  submitVideoGeneration,
  pollVideoGeneration,
  fetchResultVideo,
  ProviderError,
} from "./provider";

interface AnimationRow {
  phase: "illustrating" | "animating";
  poster_key: string | null;
  image_provider_id: string | null;
  video_provider_id: string | null;
}
const phaseGuard =
  "EXISTS(SELECT 1 FROM animation_jobs a WHERE a.job_id=jobs.id AND a.world_id=jobs.world_id AND a.phase=?)";
const videoPrompt =
  "Animate only the colorful 3D cartoon character in this image. Keep the same face, hairstyle, clothing, colors, rounded volume and proportions. The whole character gently breathes, blinks and makes a small friendly wave, then returns to its starting pose. Keep feet in place, camera locked, framing and light background unchanged, the entire figure visible. Smooth restrained motion for repeated playback. No scene cuts, camera movement, speech, text, names, additional people or new objects. Do not identify or guess a real person.";

export async function advanceAnimation(
  env: Env,
  job: JobRow,
  demo: boolean,
  imagePrompt: string,
) {
  if (!["queued", "submitting", "processing"].includes(job.status)) return;
  const animation = await env.DB.prepare(
    "SELECT * FROM animation_jobs WHERE job_id=? AND world_id=?",
  )
    .bind(job.id, job.world_id)
    .first<AnimationRow>();
  if (!animation) {
    await env.DB.prepare(
      "UPDATE jobs SET status='failed',message='The animation setup is missing. Please choose a new drawing.' WHERE id=? AND status='queued'",
    )
      .bind(job.id)
      .run();
    return;
  }
  const phase = animation.phase;
  const stage = phase === "animating" ? "animation" : "illustration";
  const uncertainMessage = `The provider may have accepted this ${stage}. Check your Higgsfield API activity before submitting it again.`;
  if (demo) {
    await env.DB.prepare(
      "UPDATE jobs SET status='failed',message=?,updated_at=? WHERE id=? AND status='queued'",
    )
      .bind(
        "Animation needs a live Higgsfield API connection. Demo mode does not generate video.",
        new Date().toISOString(),
        job.id,
      )
      .run();
    return;
  }
  if (job.status === "submitting") {
    if (Date.parse(job.updated_at) < Date.now() - 120_000)
      await env.DB.prepare(
        `UPDATE jobs SET status='uncertain',message=? WHERE id=? AND world_id=? AND status='submitting' AND ${phaseGuard} AND updated_at<?`,
      )
        .bind(
          uncertainMessage,
          job.id,
          job.world_id,
          phase,
          new Date(Date.now() - 120_000).toISOString(),
        )
        .run();
    return;
  }
  const credentials = {
    HIGGSFIELD_API_KEY: env.HIGGSFIELD_API_KEY ?? "",
    HIGGSFIELD_API_SECRET: env.HIGGSFIELD_API_SECRET ?? "",
  };
  if (job.status === "queued") {
    const claim = await env.DB.prepare(
      `UPDATE jobs SET status='submitting',updated_at=? WHERE id=? AND world_id=? AND status='queued' AND ${phaseGuard}`,
    )
      .bind(new Date().toISOString(), job.id, job.world_id, phase)
      .run();
    if (claim.meta.changes !== 1) return;
    try {
      const inputKey =
        phase === "animating" ? animation.poster_key : job.input_key;
      const input = inputKey ? await env.MEDIA.get(inputKey) : null;
      if (!input)
        throw new ProviderError(
          `The saved ${stage} input is unavailable. Please choose a new drawing.`,
        );
      const bytes = new Uint8Array(await input.arrayBuffer());
      const accepted =
        phase === "animating"
          ? await submitVideoGeneration(credentials, bytes, videoPrompt)
          : await submitGeneration(credentials, bytes, imagePrompt);
      await env.DB.batch([
        env.DB.prepare(
          `UPDATE animation_jobs SET ${phase === "animating" ? "video_provider_id" : "image_provider_id"}=? WHERE job_id=? AND world_id=? AND phase=?`,
        ).bind(accepted.requestId, job.id, job.world_id, phase),
        env.DB.prepare(
          `UPDATE jobs SET status='processing',provider_id=?,updated_at=?,message=NULL WHERE id=? AND world_id=? AND status='submitting' AND ${phaseGuard}`,
        ).bind(
          accepted.requestId,
          new Date().toISOString(),
          job.id,
          job.world_id,
          phase,
        ),
      ]);
    } catch (error) {
      const uncertain = !(error instanceof ProviderError) || error.uncertain;
      await env.DB.prepare(
        `UPDATE jobs SET status=?,message=?,updated_at=? WHERE id=? AND world_id=? AND status='submitting' AND ${phaseGuard}`,
      )
        .bind(
          uncertain ? "uncertain" : "failed",
          uncertain
            ? uncertainMessage
            : `The ${stage} could not start. ${(error as ProviderError).message}`,
          new Date().toISOString(),
          job.id,
          job.world_id,
          phase,
        )
        .run();
    }
    return;
  }
  if (
    !job.provider_id ||
    !credentials.HIGGSFIELD_API_KEY ||
    !credentials.HIGGSFIELD_API_SECRET
  )
    return;
  const lease = Date.now() + 90_000;
  const claim = await env.DB.prepare(
    `UPDATE jobs SET lease_until=? WHERE id=? AND world_id=? AND status='processing' AND provider_id=? AND lease_until<? AND ${phaseGuard}`,
  )
    .bind(lease, job.id, job.world_id, job.provider_id, Date.now(), phase)
    .run();
  if (claim.meta.changes !== 1) return;
  const owns =
    "id=? AND world_id=? AND status='processing' AND provider_id=? AND lease_until=?";
  const owned = [job.id, job.world_id, job.provider_id, lease];
  async function fail(message: string) {
    await env.DB.prepare(
      `UPDATE jobs SET status='failed',message=?,updated_at=?,lease_until=0 WHERE ${owns}`,
    )
      .bind(message, new Date().toISOString(), ...owned)
      .run();
  }
  try {
    if (phase === "illustrating") {
      const result = await pollGeneration(credentials, job.provider_id);
      if (result.status === "failed") {
        await fail(
          "The illustration could not be generated. No animation was requested. Try a clearer drawing.",
        );
      } else if (result.status === "completed" && result.imageUrl) {
        const image = await fetchResultImage(result.imageUrl);
        let poster: Uint8Array;
        try {
          poster = normalizeImage(image);
        } catch {
          throw new ProviderError(
            "The generated illustration could not be read.",
          );
        }
        const posterKey = `posters/${job.world_id}/${job.id}.png`;
        await env.MEDIA.put(posterKey, poster, {
          httpMetadata: { contentType: "image/png" },
        });
        const transition = await env.DB.batch([
          env.DB.prepare(
            `UPDATE animation_jobs SET phase='animating',poster_key=?,image_provider_id=? WHERE job_id=? AND world_id=? AND phase='illustrating' AND EXISTS(SELECT 1 FROM jobs WHERE ${owns})`,
          ).bind(posterKey, job.provider_id, job.id, job.world_id, ...owned),
          env.DB.prepare(
            `UPDATE jobs SET status='queued',provider_id=NULL,message=NULL,lease_until=0,updated_at=? WHERE ${owns} AND ${phaseGuard}`,
          ).bind(new Date().toISOString(), ...owned, "animating"),
        ]);
        if (transition[1].meta.changes === 1)
          await env.MEDIA.delete(job.input_key);
      }
    } else {
      const result = await pollVideoGeneration(credentials, job.provider_id);
      if (result.status === "failed") {
        await fail(
          "The animation could not be generated. The illustration was saved, but no video is ready. Check Higgsfield API activity before trying a new drawing.",
        );
      } else if (result.status === "completed" && result.videoUrl) {
        const bytes = await fetchResultVideo(result.videoUrl);
        const key = `characters/${job.world_id}/${job.id}.mp4`;
        await env.MEDIA.put(key, bytes, {
          httpMetadata: { contentType: "video/mp4" },
        });
        await env.DB.batch([
          env.DB.prepare(
            `INSERT OR IGNORE INTO characters(id,world_id,name,appearance,asset_key,created_at) SELECT id,world_id,name,appearance,?,? FROM jobs WHERE ${owns}`,
          ).bind(key, new Date().toISOString(), ...owned),
          env.DB.prepare(
            `UPDATE jobs SET status='completed',message=NULL,lease_until=0,updated_at=? WHERE ${owns}`,
          ).bind(new Date().toISOString(), ...owned),
          ...completePartyEntry(env.DB, job.world_id, job.id),
        ]);
      }
    }
  } catch (error) {
    if (
      error instanceof HttpError ||
      (error instanceof ProviderError && !error.retryable)
    )
      await fail(
        `The generated ${stage} could not be loaded. Check Higgsfield API activity before trying a new drawing.`,
      );
    // Transient polls/downloads retry the saved request, never a paid submission.
  } finally {
    await env.DB.prepare(
      `UPDATE jobs SET lease_until=0,updated_at=? WHERE ${owns}`,
    )
      .bind(new Date().toISOString(), ...owned)
      .run();
  }
}
