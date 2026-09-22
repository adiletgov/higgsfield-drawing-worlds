import { useEffect, useRef, useState } from "react";
import type { PartyState, Snapshot } from "../shared";
import { api } from "./api";
import { partyPresentation } from "./party";
import { Button, Icon, Notice } from "./ui";

export function PartyControls({
  snapshot,
  onUpdate,
  onRefresh,
  stale = false,
}: {
  snapshot: Snapshot;
  onUpdate: (next: Snapshot) => void;
  onRefresh: () => void;
  stale?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  const generation = useRef(0);
  const view = partyPresentation(snapshot.party, snapshot.characters);
  useEffect(() => {
    generation.current++;
    setError("");
    setMessage("");
    setBusy(false);
    lock.current = false;
    return () => {
      generation.current++;
    };
  }, [snapshot.world.id]);
  async function act(action: "reveal" | "next") {
    if (lock.current || stale || !view.active) return;
    const id = snapshot.world.id;
    const activeCharacterId = view.active.id;
    const version = generation.current;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api<PartyState>(`/api/worlds/${id}/party`, {
        method: "PATCH",
        body: JSON.stringify({ action, activeCharacterId }),
      });
      const fresh = await api<Snapshot>(`/api/worlds/${id}`);
      if (version !== generation.current) return;
      onUpdate(fresh);
      setMessage(
        action === "reveal"
          ? "Name revealed on the shared screen."
          : fresh.party?.activeCharacterId
            ? "The next drawing is on screen."
            : "All caught up. New drawings will join the queue automatically.",
      );
    } catch (e) {
      if (version === generation.current) {
        setError(
          e instanceof Error
            ? e.message
            : "The round could not be updated. Check the screen and try again.",
        );
        onRefresh();
      }
    } finally {
      if (version === generation.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  return (
    <div className="party-host-controls">
      <div className="party-host-control-row">
        <div>
          <span className="eyebrow">HOST CONTROLS</span>
          <strong>
            {view.active
              ? view.canReveal
                ? "Let the room guess."
                : "Ready for the next face?"
              : "Waiting for the next drawing."}
          </strong>
        </div>
        <div className="party-action-buttons">
          <Button
            intent="primary"
            busy={busy && view.canReveal}
            disabled={!view.canReveal || busy || stale}
            onClick={() => void act("reveal")}
          >
            <Icon name="spark" />
            Reveal name
          </Button>
          <Button
            busy={busy && view.canNext}
            disabled={!view.canNext || busy || stale}
            onClick={() => void act("next")}
          >
            Next drawing
            <Icon name="arrow" />
          </Button>
        </div>
      </div>
      <p className="party-controls-hint">
        {stale
          ? "The display connection needs a refresh before you can change rounds."
          : view.active && !view.canNext
            ? "Reveal the name before moving to the next drawing."
            : "Only the host controls the rounds. Guests just draw and guess."}
      </p>
      {message && (
        <span className="party-control-status" role="status">
          {message}
        </span>
      )}
      {error && (
        <Notice error>
          {error}
          <Button onClick={onRefresh}>Refresh round</Button>
        </Notice>
      )}
    </div>
  );
}
