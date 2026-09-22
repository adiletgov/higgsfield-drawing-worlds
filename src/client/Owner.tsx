import { useState, useRef, type FormEvent } from "react";
import type {
  Session,
  Snapshot,
  World,
  Theme,
  Character,
  Job,
} from "../shared";
import { api, usePageTitle, useResource, useUnsaved } from "./api";
import { accessLink } from "./logic";
import {
  Brand,
  Button,
  CopyButton,
  Dialog,
  Icon,
  Loading,
  Notice,
  QR,
  ThemePicker,
  themes,
} from "./ui";
import { CharacterImage, WorldStage } from "./WorldStage";
import { PartyStage } from "./PartyStage";
import { PartyControls } from "./PartyControls";

type Modal =
  | "create"
  | "edit"
  | "rotate"
  | Character
  | { kind: "resolve"; job: Job }
  | null;
type ConnectionCheck = {
  ok: boolean;
  classification: string;
  message: string;
  httpStatus?: number;
  schemaValid?: boolean;
  uploadHeadersValid?: boolean;
};
export function Owner({ session }: { session: Session }) {
  const list = useResource<{ worlds: World[] }>("/api/worlds");
  const [selected, setSelected] = useState("");
  const world =
    list.data?.worlds.find((w) => w.id === selected) ||
    list.data?.worlds.find((w) => w.theme === "party") ||
    list.data?.worlds[0];
  const snapshot = useResource<Snapshot>(
    world ? `/api/worlds/${world.id}` : null,
    undefined,
    3500,
  );
  const [modal, setModal] = useState<Modal>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [connectionCheck, setConnectionCheck] = useState<ConnectionCheck>();
  const [connectionError, setConnectionError] = useState("");
  const connectionLock = useRef(false);
  usePageTitle(world ? `${world.name} · Studio` : "Your studio");
  const current = snapshot.data?.world || world;
  const isParty = !current || current.theme === "party";
  const join = current?.guestToken
    ? accessLink(location.origin, "join", current.id, current.guestToken)
    : "";
  const display = current?.displayToken
    ? accessLink(location.origin, "world", current.id, current.displayToken)
    : "";
  async function checkConnection() {
    if (connectionLock.current) return;
    connectionLock.current = true;
    setCheckingConnection(true);
    setConnectionCheck(undefined);
    setConnectionError("");
    try {
      setConnectionCheck(await api<ConnectionCheck>("/api/connection-check"));
    } catch (e) {
      setConnectionError(
        e instanceof Error
          ? e.message
          : "The connection check could not finish. Please try again.",
      );
    } finally {
      connectionLock.current = false;
      setCheckingConnection(false);
    }
  }
  async function patch(values: Partial<World> & { rotateGuest?: true }) {
    if (!current || busy) return;
    setBusy(true);
    setError("");
    try {
      const updated = await api<World>(`/api/worlds/${current.id}`, {
        method: "PATCH",
        body: JSON.stringify(values),
      });
      list.setData((old) =>
        old
          ? {
              worlds: old.worlds.map((w) =>
                w.id === updated.id ? updated : w,
              ),
            }
          : old,
      );
      snapshot.setData((old) => (old ? { ...old, world: updated } : old));
      setNotice(
        values.rotateGuest
          ? "A new invitation is ready. The previous upload link no longer works."
          : values.uploadsOpen === false
            ? "Uploads paused. Everyone already here stays."
            : values.uploadsOpen === true
              ? "Uploads are open."
              : "Changes saved.",
      );
      setModal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Changes could not be saved.");
      if (values.name !== undefined || values.theme !== undefined) throw e;
    } finally {
      setBusy(false);
    }
  }
  async function remove(character: Character) {
    if (!current || busy) return;
    const worldId = current.id;
    let removed = false;
    setBusy(true);
    setError("");
    try {
      await api(`/api/worlds/${worldId}/characters/${character.id}`, {
        method: "DELETE",
      });
      removed = true;
      const fresh = await api<Snapshot>(`/api/worlds/${worldId}`);
      snapshot.setData((old) => (old?.world.id === worldId ? fresh : old));
      setModal(null);
      setNotice("Drawing removed. The current round is up to date.");
    } catch (e) {
      if (removed) {
        setModal(null);
        setError(
          "The drawing was removed, but the screen could not refresh. Reconnecting to the current round…",
        );
        snapshot.refresh();
      } else {
        setError(
          e instanceof Error ? e.message : "The drawing could not be removed.",
        );
      }
    } finally {
      setBusy(false);
    }
  }
  async function resolveUpload(job: Job) {
    if (!current || busy || job.status !== "uncertain") return;
    setBusy(true);
    setError("");
    try {
      const reviewed = await api<Job>(
        `/api/worlds/${current.id}/jobs/${job.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ resolveUncertain: true }),
        },
      );
      snapshot.setData((old) =>
        old
          ? {
              ...old,
              jobs: old.jobs.map((item) =>
                item.id === reviewed.id ? reviewed : item,
              ),
            }
          : old,
      );
      setModal(null);
      setNotice(
        `${job.name} marked as reviewed. The guest can check its status and choose another drawing. A new upload starts a separate generation.`,
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "This upload could not be marked as reviewed. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="studio">
      <header className="app-header">
        <Brand />
        <nav aria-label="Studio navigation">
          <span className="studio-label">
            A party game with a personal touch
          </span>
          <span className="owner-badge">
            <span className="owner-dot" />
            Host desk
          </span>
        </nav>
      </header>
      {session.demo && (
        <div className="preview-strip">
          <span className="preview-label">PREVIEW</span>Local sample processing
          is on. Live Higgsfield AI is not connected.
        </div>
      )}
      {!session.generationReady && !session.demo && (
        <Notice>
          Your room is ready. Connect Higgsfield generation to prepare the
          portraits.
        </Notice>
      )}
      <main className="studio-main">
        <div className="heading-row">
          <div>
            <div className="eyebrow">
              YOUR FRIENDS. YOUR VERY QUESTIONABLE ART.
            </div>
            <h1>
              Draw someone
              <br />
              <span>at this party.</span>
              <span className="hero-asterisk" aria-hidden="true">
                ✳
              </span>
            </h1>
            <p className="intro">
              Pass the paper. Pick a face. Let the room do the guessing.
            </p>
          </div>
          <Button
            intent="primary"
            onClick={() => {
              setError("");
              setModal("create");
            }}
          >
            <Icon name="plus" />
            New party
          </Button>
        </div>
        <div className="workspace">
          <section className="world-main" aria-label="Shared screen preview">
            <div className="world-toolbar">
              <div className="world-identity">
                <span className="world-icon">
                  <Icon name={isParty ? "pencil" : "fish"} />
                </span>
                <div>
                  <h2>{current?.name || "Your next great party idea"}</h2>
                  <span className="world-subtitle">
                    {current
                      ? themes[current.theme].name
                      : "Create a room. Invite the usual suspects."}
                  </span>
                </div>
              </div>
              <div className="toolbar-actions">
                {current && (
                  <Button
                    intent="ghost"
                    aria-label="Edit room"
                    onClick={() => {
                      setError("");
                      setModal("edit");
                    }}
                  >
                    <Icon name="settings" />
                  </Button>
                )}
                <Button
                  intent="ghost"
                  aria-pressed={paused}
                  aria-label={paused ? "Play animation" : "Pause animation"}
                  onClick={() => setPaused((p) => !p)}
                >
                  <Icon name={paused ? "play" : "pause"} />
                </Button>
                {display && (
                  <a
                    className="button button-neutral display-open"
                    aria-label="Open display"
                    href={display}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Icon name="expand" />
                    <span>Open display</span>
                  </a>
                )}
              </div>
            </div>
            {snapshot.loading && current && !snapshot.data ? (
              <Loading />
            ) : isParty ? (
              <PartyStage
                snapshot={snapshot.data}
                preview={!current}
                paused={paused}
              />
            ) : (
              <WorldStage
                snapshot={snapshot.data}
                theme={current?.theme}
                preview={!current}
                paused={paused}
              />
            )}
            {isParty && snapshot.data && (
              <PartyControls
                snapshot={snapshot.data}
                stale={Boolean(snapshot.error) || snapshot.loading}
                onRefresh={snapshot.refresh}
                onUpdate={(next) =>
                  snapshot.setData((old) =>
                    old?.world.id === next.world.id
                      ? old.party?.activeCharacterId ===
                          next.party?.activeCharacterId &&
                        old.party?.revealed &&
                        !next.party?.revealed
                        ? old
                        : next
                      : old,
                  )
                }
              />
            )}
            <div className="stage-footer">
              <span
                className={`live-label ${current && !current.uploadsOpen ? "is-paused" : ""}`}
              >
                <i />
                {current
                  ? current.uploadsOpen
                    ? "Guests can add drawings"
                    : "Uploads paused"
                  : "Your next party starts with a pen."}
              </span>
              <span className="made-with">
                Made with <strong>Higgsfield API</strong>
                <span className="tiny-spark">✳</span>
              </span>
            </div>
            {snapshot.error && (
              <Notice error>
                {snapshot.error}{" "}
                <Button onClick={snapshot.refresh}>Try again</Button>
              </Notice>
            )}
          </section>
          <aside className="join-panel">
            <span className="paper-pin" />
            <span className="eyebrow">INVITE THE WHOLE ROOM</span>
            <h2>
              Everyone’s an artist.
              <br />
              Allegedly.
            </h2>
            <div className="join-doodle">
              <Icon name="pencil" size={32} />
              <span className="dashed-arrow">⤳</span>
              <Icon name="spark" size={31} />
            </div>
            <p>
              {isParty
                ? "Scan the code. Draw someone at the party. No names on the paper—keep us guessing."
                : "Scan the code and send a drawing from your phone. Everyone can join."}
            </p>
            {join ? (
              <>
                <div className="invite-qr">
                  <QR value={join} />
                  <span>No account. Just a little audacity.</span>
                </div>
                <a
                  className="button button-primary"
                  href={join}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Icon name="upload" />
                  Add a drawing
                  <Icon name="arrow" />
                </a>
                <CopyButton value={join} />
                <p className="helper-note">
                  Anyone with the invitation can add a drawing while uploads are
                  open.
                </p>
              </>
            ) : (
              <>
                <div className="empty-invitation">
                  <span className="sketch-arrow">↙</span>
                  <span>
                    Best played with
                    <br />
                    people you know.
                  </span>
                </div>
                <Button intent="primary" onClick={() => setModal("create")}>
                  Create a party
                  <Icon name="arrow" />
                </Button>
              </>
            )}
          </aside>
        </div>
        {notice && <Notice>{notice}</Notice>}
        {error && !modal && <Notice error>{error}</Notice>}
        <div className="below-stage">
          <section className="world-shelf" aria-labelledby="worlds-heading">
            <div className="section-heading">
              <h2 id="worlds-heading">Your rooms</h2>
              <span>Pick up where the party left off.</span>
            </div>
            {list.loading ? (
              <Loading label="Finding your rooms…" />
            ) : list.error ? (
              <Notice error>
                {list.error}
                <Button onClick={list.refresh}>Try again</Button>
              </Notice>
            ) : list.data?.worlds.length ? (
              <div className="world-list">
                {list.data.worlds.map((w) => (
                  <button
                    key={w.id}
                    className={`world-tab ${current?.id === w.id ? "selected" : ""}`}
                    onClick={() => {
                      setSelected(w.id);
                      setNotice("");
                      setError("");
                    }}
                    aria-pressed={current?.id === w.id}
                  >
                    <img src={`/${w.theme}.svg`} alt="" />
                    <span>
                      <strong>{w.name}</strong>
                      <small>{themes[w.theme].name}</small>
                    </span>
                    {current?.id === w.id ? (
                      <span className="world-selected">
                        <Icon name="check" size={14} />
                      </span>
                    ) : (
                      <Icon name="arrow" size={16} />
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <p className="empty-list">
                Your parties live here. Make one, put it on the big screen, and
                pass around some paper.
              </p>
            )}
          </section>
          <div className="how-it-works">
            <span className="eyebrow">HOW TO GET THE ROOM TALKING</span>
            <ol>
              <li>
                <span>1</span>Draw someone at this party.
              </li>
              <li>
                <span>2</span>Upload it. Keep the answer secret.
              </li>
              <li>
                <span>3</span>Guess together. Host reveals.
              </li>
            </ol>
          </div>
        </div>
        {current && (
          <section className="residents">
            <div className="section-heading">
              <h2>{isParty ? "The portrait queue" : "Your drawings"}</h2>
              <span>Ready drawings stay here until you remove them.</span>
            </div>
            {snapshot.data?.characters.length ? (
              <ul className="resident-list">
                {snapshot.data.characters.map((c) => (
                  <li key={c.id}>
                    <div className="resident-avatar">
                      <CharacterImage character={c} worldId={current.id} />
                    </div>
                    <span>
                      <strong>{c.name}</strong>
                      <small>
                        {c.appearance === "handmade" ? "Handmade" : "Polished"}
                      </small>
                    </span>
                    <Button
                      intent="ghost"
                      aria-label={`Remove drawing: ${c.name}`}
                      onClick={() => {
                        setError("");
                        setModal(c);
                      }}
                    >
                      <Icon name="trash" size={18} />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-list">Waiting for the first brave artist.</p>
            )}
            {snapshot.data?.jobs
              .filter((j) => j.status !== "completed")
              .map((j) => (
                <div
                  className="job-row"
                  key={j.id}
                  style={{ flexWrap: "wrap", alignItems: "center" }}
                >
                  <span>{j.name}</span>
                  <span>
                    {j.status === "uncertain"
                      ? "Needs host review"
                      : j.status === "failed"
                        ? "Needs another try"
                        : j.status === "queued"
                          ? "Waiting to be prepared"
                          : "Preparing portrait…"}
                  </span>
                  {j.status === "uncertain" && (
                    <Button
                      aria-label={`Resolve upload for ${j.name}`}
                      disabled={busy}
                      onClick={() => {
                        setError("");
                        setModal({ kind: "resolve", job: j });
                      }}
                    >
                      Resolve upload
                    </Button>
                  )}
                </div>
              ))}
            <div className="world-controls">
              <Button
                busy={busy}
                onClick={() =>
                  void patch({ uploadsOpen: !current.uploadsOpen })
                }
              >
                <Icon name={current.uploadsOpen ? "pause" : "play"} />
                {current.uploadsOpen ? "Pause uploads" : "Open uploads"}
              </Button>
              <Button
                intent="ghost"
                onClick={() => {
                  setError("");
                  setModal("rotate");
                }}
              >
                Replace invitation link
              </Button>
              <p>
                Pausing uploads keeps the current round and existing drawings.
              </p>
            </div>
          </section>
        )}
        <div className="world-controls">
          <Button
            busy={checkingConnection}
            onClick={() => void checkConnection()}
          >
            Check API connection
          </Button>
          <p role={checkingConnection ? "status" : undefined}>
            {checkingConnection
              ? "Checking API access… No character will be generated."
              : "Checks API access without generating a character."}
          </p>
        </div>
        {connectionCheck && (
          <Notice error={!connectionCheck.ok}>
            <span>{connectionCheck.message}</span>
            {!connectionCheck.ok && (
              <span>
                {connectionCheck.classification}
                {connectionCheck.httpStatus !== undefined
                  ? ` · HTTP ${connectionCheck.httpStatus}`
                  : ""}
              </span>
            )}
          </Notice>
        )}
        {connectionError && <Notice error>{connectionError}</Notice>}
      </main>
      <footer className="site-footer">
        <span>Good company. Questionable portraits.</span>
        <span>Draw the room · Powered by Higgsfield API</span>
      </footer>
      {(modal === "create" || modal === "edit") && (
        <WorldForm
          world={modal === "edit" ? current : undefined}
          onClose={() => setModal(null)}
          onSave={async (name, theme) => {
            if (modal === "edit") {
              await patch({ name, theme });
              return;
            }
            const created = await api<World>("/api/worlds", {
              method: "POST",
              body: JSON.stringify({ name, theme }),
            });
            list.setData((old) => ({
              worlds: [...(old?.worlds || []), created],
            }));
            setSelected(created.id);
            list.refresh();
            setModal(null);
            setNotice(
              `${created.name} is ready. Open the display and invite your guests.`,
            );
          }}
        />
      )}
      {modal === "rotate" && (
        <Dialog
          title="Replace this invitation?"
          description="The previous QR code and upload link will stop working. Existing characters stay, and your display link stays the same."
          onClose={() => setModal(null)}
          busy={busy}
        >
          {error && <Notice error>{error}</Notice>}
          <div className="dialog-actions">
            <Button data-cancel onClick={() => setModal(null)} disabled={busy}>
              Keep current link
            </Button>
            <Button
              intent="danger"
              busy={busy}
              onClick={() => void patch({ rotateGuest: true })}
            >
              Replace invitation
            </Button>
          </div>
        </Dialog>
      )}
      {modal && typeof modal === "object" && "kind" in modal && (
        <Dialog
          title={`Resolve ${modal.job.name}?`}
          description="Check this request in your Higgsfield API activity before continuing. Marking it as reviewed closes this app’s tracking so the guest can choose another drawing. It does not cancel the provider job or issue a refund. Any new upload starts another paid generation."
          onClose={() => setModal(null)}
          busy={busy}
        >
          {error && <Notice error>{error}</Notice>}
          <div className="dialog-actions">
            <Button data-cancel onClick={() => setModal(null)} disabled={busy}>
              Keep checking
            </Button>
            <Button
              intent="primary"
              busy={busy}
              onClick={() => void resolveUpload(modal.job)}
            >
              Mark as reviewed
            </Button>
          </div>
        </Dialog>
      )}
      {modal && typeof modal === "object" && !("kind" in modal) && (
        <Dialog
          title={`Remove ${modal.name}?`}
          description={
            isParty && snapshot.data?.party?.activeCharacterId === modal.id
              ? "This drawing will be removed permanently, and the next available drawing will move onto the screen. Its secret answer will stay hidden. This cannot be undone."
              : "This drawing will be removed permanently. All other drawings stay. This cannot be undone."
          }
          onClose={() => setModal(null)}
          busy={busy}
        >
          {error && <Notice error>{error}</Notice>}
          <div className="dialog-actions">
            <Button data-cancel onClick={() => setModal(null)} disabled={busy}>
              Keep character
            </Button>
            <Button
              intent="danger"
              busy={busy}
              onClick={() => void remove(modal)}
            >
              Remove character
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
function WorldForm({
  world,
  onClose,
  onSave,
}: {
  world?: World;
  onClose: () => void;
  onSave: (name: string, theme: Theme) => Promise<void>;
}) {
  const [name, setName] = useState(world?.name || "");
  const [theme, setTheme] = useState<Theme>(world?.theme || "party");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [discard, setDiscard] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const dirty =
    name !== (world?.name || "") || theme !== (world?.theme || "party");
  useUnsaved(dirty && !busy);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!name.trim()) {
      setInvalid(true);
      nameRef.current?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave(name.trim(), theme);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not save this world. Your changes are still here.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={
        discard
          ? "Leave these changes?"
          : world
            ? "Room settings"
            : "Start something worth guessing"
      }
      onClose={() => (dirty ? setDiscard(true) : onClose())}
      busy={busy}
    >
      {discard ? (
        <>
          <p>Your changes haven’t been saved.</p>
          <div className="dialog-actions">
            <Button data-cancel onClick={() => setDiscard(false)}>
              Keep editing
            </Button>
            <Button intent="danger" onClick={onClose}>
              Discard changes
            </Button>
          </div>
        </>
      ) : (
        <form noValidate onSubmit={save}>
          <label className="field-label" htmlFor="world-name">
            Room name
          </label>
          <input
            ref={nameRef}
            id="world-name"
            autoComplete="off"
            maxLength={80}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setInvalid(false);
            }}
            placeholder="e.g. Friday, questionable decisions"
            aria-invalid={invalid}
            aria-describedby={invalid ? "world-name-error" : undefined}
          />
          {invalid && (
            <span id="world-name-error" className="field-error">
              Give your room a name.
            </span>
          )}
          <ThemePicker value={theme} onChange={setTheme} />
          {error && <Notice error>{error}</Notice>}
          <div className="dialog-actions">
            <Button
              type="button"
              onClick={() => (dirty ? setDiscard(true) : onClose())}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" intent="primary" busy={busy}>
              {world ? "Save changes" : "Create room"}
              <Icon name="arrow" />
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
