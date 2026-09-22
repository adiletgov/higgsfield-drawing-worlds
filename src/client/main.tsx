import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { Session } from "../shared";
import { usePageTitle, useResource } from "./api";
import { parseRoute } from "./logic";
import { Brand, Button, Loading, Notice } from "./ui";
import { Owner } from "./Owner";
import { Display } from "./Display";
import { Join } from "./Join";
import { PartyStage } from "./PartyStage";
import "./styles.css";
function App() {
  const session = useResource<Session>("/api/session");
  const route = parseRoute(location.pathname);
  if (session.loading) return <Loading label="Opening Draw the room…" />;
  if (session.error || !session.data)
    return (
      <main className="access-state">
        <Brand />
        <h1>Let’s reconnect.</h1>
        <Notice error>
          {session.error || "Draw the room is temporarily unavailable."}
        </Notice>
        <Button onClick={session.refresh}>Try again</Button>
      </main>
    );
  if (route.kind === "missing")
    return (
      <main className="access-state">
        <Brand />
        <h1>This page wandered off.</h1>
        <p>Use your invitation to find the right world.</p>
        <a className="button button-primary" href="/">
          Go to host desk
        </a>
      </main>
    );
  if (route.kind === "join")
    return <Join id={route.id} session={session.data} />;
  if (route.kind === "world")
    return <Display id={route.id} session={session.data} />;
  if (!session.data.owner) return <Access session={session.data} />;
  return <Owner session={session.data} />;
}
function Access({ session }: { session: Session }) {
  usePageTitle(session.configured ? "Host sign in" : "Set up Draw the room");
  return (
    <div className="access-layout">
      <header className="app-header">
        <Brand />
      </header>
      <main>
        <div className="access-copy">
          <span className="eyebrow">GOOD COMPANY. QUESTIONABLE PORTRAITS.</span>
          <h1>
            Draw someone
            <br />
            <span>at this party.</span>
          </h1>
          <p>
            Everyone draws someone in the room. Their portrait goes on the big
            screen. You guess, the host reveals. No artistic talent required.
          </p>
          {session.configured ? (
            <>
              <a className="button button-primary" href={session.signInUrl}>
                Sign in to host a party
              </a>
              <small>
                Guests can join directly with an invitation or QR code.
              </small>
            </>
          ) : (
            <Notice>
              <strong>Your host desk is almost ready.</strong>
              <p>
                The site owner needs to complete secure host sign-in and
                generation setup on the server. The setup guide is included with
                the project.
              </p>
            </Notice>
          )}
        </div>
        <PartyStage preview />
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
