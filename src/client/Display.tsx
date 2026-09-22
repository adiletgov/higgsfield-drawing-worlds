import { useState } from "react";
import type { Session, Snapshot } from "../shared";
import { useFragmentToken, usePageTitle, useResource } from "./api";
import { accessLink } from "./logic";
import { Button, Icon, Loading, Notice, QR } from "./ui";
import { WorldStage } from "./WorldStage";
import { PartyStage } from "./PartyStage";
export function Display({ id, session }: { id: string; session: Session }) {
  const token = useFragmentToken("world", id);
  const { data, error, loading, refresh } = useResource<Snapshot>(
    `/api/worlds/${id}`,
    token,
    1000,
  );
  const [paused, setPaused] = useState(false);
  const [fullError, setFullError] = useState("");
  usePageTitle(data?.world.name || "Party display");
  const join = data?.world.guestToken
    ? accessLink(location.origin, "join", id, data.world.guestToken)
    : "";
  if (loading && !data) return <Loading label="Opening the party screen…" />;
  if (!data)
    return (
      <main className="access-state">
        <h1>This room isn’t open yet.</h1>
        <Notice error>{error || "Ask the host for a display link."}</Notice>
        <Button onClick={refresh}>Try again</Button>
        <a href="/">Go to host desk</a>
      </main>
    );
  return (
    <main
      className={`display-page ${data.world.theme === "party" ? "party-display" : ""}`}
    >
      {data.world.theme === "party" ? (
        <PartyStage snapshot={data} token={token} full paused={paused} />
      ) : (
        <WorldStage snapshot={data} token={token} full paused={paused} />
      )}
      <header className="display-heading">
        <span className="eyebrow">DRAW THE ROOM</span>
        <h1>{data.world.name}</h1>
        {session.demo && (
          <span className="display-preview">
            Preview · local sample processing
          </span>
        )}
      </header>
      <div className="display-controls">
        <Button
          aria-pressed={paused}
          aria-label={paused ? "Play animation" : "Pause animation"}
          onClick={() => setPaused((value) => !value)}
        >
          <Icon name={paused ? "play" : "pause"} />
        </Button>
        <Button
          aria-label="Enter full screen"
          onClick={async () => {
            try {
              if (document.fullscreenElement) await document.exitFullscreen();
              else await document.documentElement.requestFullscreen();
            } catch {
              setFullError("Full screen is unavailable in this browser.");
            }
          }}
        >
          <Icon name="expand" />
        </Button>
      </div>
      {join && (
        <aside className="display-invite">
          <QR value={join} />
          <div>
            <span className="eyebrow">
              {data.world.theme === "party"
                ? "GOT SOMEONE IN MIND?"
                : "ADD YOUR IMAGINATION"}
            </span>
            <h2>
              {data.world.theme === "party" ? (
                <>
                  Draw someone
                  <br />
                  at this party.
                </>
              ) : (
                <>
                  Your drawing
                  <br />
                  belongs here.
                </>
              )}
            </h2>
            <p>
              {data.world.uploadsOpen
                ? data.world.theme === "party"
                  ? "Scan. Draw. Keep the name off the paper."
                  : "Scan to add your drawing."
                : "The host has paused uploads."}
            </p>
            <a href={join} target="_blank" rel="noreferrer">
              Add a drawing
              <Icon name="arrow" size={16} />
            </a>
          </div>
        </aside>
      )}
      <div className="display-wordmark">
        draw the room <span>✳</span>
      </div>
      {(error || fullError) && (
        <div className="display-notice">
          <Notice error>
            {error || fullError}
            {error && <Button onClick={refresh}>Reconnect</Button>}
          </Notice>
        </div>
      )}
    </main>
  );
}
