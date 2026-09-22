import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { Session } from "../shared";
import { usePageTitle, useResource } from "./api";
import { parseRoute } from "./logic";
import { Brand, Button, Loading, Notice } from "./ui";
import { Owner } from "./Owner";
import { Display } from "./Display";
import { Join } from "./Join";
import { WorldStage } from "./WorldStage";
import "./styles.css";
function App() {
  const session = useResource<Session>("/api/session");
  const route = parseRoute(location.pathname);
  if (session.loading) return <Loading label="Opening Drawing Worlds…" />;
  if (session.error || !session.data)
    return (
      <main className="access-state">
        <Brand />
        <h1>Let’s reconnect.</h1>
        <Notice error>
          {session.error || "Drawing Worlds is temporarily unavailable."}
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
          Go to host studio
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
  usePageTitle(session.configured ? "Host sign in" : "Set up Drawing Worlds");
  return (
    <div className="access-layout">
      <header className="app-header">
        <Brand />
      </header>
      <main>
        <div className="access-copy">
          <span className="eyebrow">A HOME FOR EVERY IMAGINATION</span>
          <h1>
            Small drawings.
            <br />
            <span>Big worlds.</span>
          </h1>
          <p>
            Create a living world, invite your people, and watch their drawings
            find a home.
          </p>
          {session.configured ? (
            <>
              <a className="button button-primary" href={session.signInUrl}>
                Sign in to your studio
              </a>
              <small>
                Guests can join directly with an invitation or QR code.
              </small>
            </>
          ) : (
            <Notice>
              <strong>Your studio is almost ready.</strong>
              <p>
                The site owner needs to complete secure host sign-in and
                generation setup on the server. The setup guide is included with
                the project.
              </p>
            </Notice>
          )}
        </div>
        <WorldStage preview />
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
