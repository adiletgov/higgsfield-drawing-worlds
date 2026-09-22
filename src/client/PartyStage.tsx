import type { Snapshot } from "../shared";
import { partyPresentation } from "./party";
import { CharacterImage } from "./WorldStage";
import { Icon } from "./ui";

export function PartyStage({
  snapshot,
  token,
  full = false,
  preview = false,
  paused = false,
}: {
  snapshot?: Snapshot;
  token?: string;
  full?: boolean;
  preview?: boolean;
  paused?: boolean;
}) {
  const view = partyPresentation(snapshot?.party, snapshot?.characters || []);
  const preparing =
    snapshot?.jobs.filter((job) =>
      ["queued", "submitting", "processing"].includes(job.status),
    ).length || 0;
  const finished = !!snapshot?.party?.round && !view.active;
  return (
    <div
      className={`world-stage party-stage ${full ? "stage-full" : ""} ${paused ? "motion-paused" : ""}`}
      aria-label="Party guessing screen"
    >
      <img className="world-background" src="/party.svg" alt="" />
      <div className="party-stage-meta">
        <span>
          {view.active
            ? `ROUND ${String(snapshot?.party?.round || 1).padStart(2, "0")}`
            : preview
              ? "GOOD COMPANY. QUESTIONABLE PORTRAITS."
              : finished
                ? "CAUGHT UP. FOR NOW."
                : "THE ROOM IS YOUR INSPIRATION"}
        </span>
        <span>
          {view.queued} {view.queued === 1 ? "drawing" : "drawings"} in queue
        </span>
      </div>
      <div
        className={`party-spotlight ${view.answer ? "answer-revealed" : ""}`}
      >
        <div className="portrait-paper" key={view.active?.id || "party-sample"}>
          <span className="napkin-corner" aria-hidden="true" />
          {view.active && snapshot ? (
            <CharacterImage
              character={view.active}
              worldId={snapshot.world.id}
              token={token}
              label={view.portraitLabel}
            />
          ) : (
            <img
              src="/sample-portrait.svg"
              alt="Illustrative sample caricature"
            />
          )}
          <span className="portrait-stamp">
            {view.active
              ? "DRAWN BY SOMEONE IN THIS ROOM"
              : "ILLUSTRATIVE SAMPLE"}
          </span>
        </div>
        <div className="party-question" aria-live="polite">
          <span className="eyebrow">
            {view.answer
              ? "THE REVEAL"
              : view.active
                ? "TAKE A GOOD LOOK"
                : finished
                  ? "ANOTHER ROUND?"
                  : "NO ARTISTIC TALENT REQUIRED"}
          </span>
          <h2>
            {view.answer ||
              (view.active
                ? "Who is it?"
                : finished
                  ? "Keep them guessing."
                  : "Know this face?")}
          </h2>
          <p>
            {view.answer
              ? "The resemblance is… a matter of opinion."
              : view.active
                ? "Make your guesses. The host has the reveal."
                : preparing
                  ? "Your next mystery portrait is being prepared."
                  : preview
                    ? "Draw your friend. Let everyone else figure it out."
                    : "Scan the QR. Draw someone here. Keep the name off the paper."}
          </p>
        </div>
      </div>
      <span className="party-stage-scribble" aria-hidden="true">
        <Icon name="pencil" size={19} />a very unofficial portrait gallery
      </span>
    </div>
  );
}
