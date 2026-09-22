import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Appearance, Job, Session, Snapshot } from "../shared";
import {
  api,
  ApiError,
  useAlive,
  useFragmentToken,
  usePageTitle,
  useResource,
  useUnsaved,
} from "./api";
import { normalizePhoto } from "./logic";
import { Brand, Button, Icon, Loading, Notice, themes } from "./ui";

const statusCopy: Record<Job["status"], { title: string; body: string }> = {
  queued: {
    title: "Your drawing is in line.",
    body: "We’ve received it. You can keep this page open to see its big entrance.",
  },
  submitting: {
    title: "A little magic is beginning.",
    body: "Your drawing is being sent to Higgsfield. Your place in this world is saved.",
  },
  processing: {
    title: "Finding its feet. Or fins.",
    body: "Higgsfield is turning your drawing into a character. The other residents are waiting.",
  },
  completed: {
    title: "Hello, little world!",
    body: "Your character has joined the others. Look up at the shared display to say hello.",
  },
  failed: {
    title: "This one needs another try.",
    body: "Your character could not be created. The world and all its existing residents are safe.",
  },
  uncertain: {
    title: "We’re checking its arrival.",
    body: "The generation result is not confirmed. Ask the host to review it before sending this drawing again.",
  },
};
export function Join({ id, session }: { id: string; session: Session }) {
  const token = useFragmentToken("join", id);
  const resource = useResource<Snapshot>(`/api/worlds/${id}`, token, 5000);
  const [name, setName] = useState("");
  const [appearance, setAppearance] = useState<Appearance>("handmade");
  const [photo, setPhoto] = useState("");
  const [fileName, setFileName] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [dragging, setDragging] = useState(false);
  const jobKey = `drawing-worlds:job:${id}`;
  const requestKey = `drawing-worlds:request:${id}`;
  const [savedRequest, setSavedRequest] = useState(() => {
    try {
      return sessionStorage.getItem(requestKey) || "";
    } catch {
      return "";
    }
  });
  const [recovering, setRecovering] = useState(Boolean(savedRequest));
  const [recoverVersion, setRecoverVersion] = useState(0);
  const [storageWarning, setStorageWarning] = useState("");
  const [jobId, setJobId] = useState<string>(() => {
    try {
      return sessionStorage.getItem(jobKey) || "";
    } catch {
      return "";
    }
  });
  const [job, setJob] = useState<Job>();
  const [requestId, setRequestId] = useState(
    () => savedRequest || crypto.randomUUID(),
  );
  const [statusError, setStatusError] = useState("");
  const [retryStatus, setRetryStatus] = useState(0);
  const photoInput = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const submitLock = useRef(false);
  const chooseVersion = useRef(0);
  const alive = useAlive();
  const world = resource.data?.world;
  const active = !!jobId || sending || uncertain || recovering;
  usePageTitle(world ? `Add a drawing to ${world.name}` : "Add your drawing");
  useUnsaved(Boolean(photo) && !jobId);
  useEffect(() => {
    if (!savedRequest || jobId) {
      setRecovering(false);
      return;
    }
    const ctrl = new AbortController();
    let cancelled = false;
    setRecovering(true);
    api<Job>(
      `/api/worlds/${id}/jobs/request/${savedRequest}`,
      { signal: ctrl.signal },
      token,
    )
      .then((found) => {
        if (cancelled) return;
        setJob(found);
        setJobId(found.id);
        setUncertain(false);
        setError("");
        try {
          sessionStorage.setItem(jobKey, found.id);
        } catch {}
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) {
          setUncertain(false);
          setError(
            "Your earlier drawing was not received. Choose it again to continue with the same request.",
          );
        } else {
          setUncertain(true);
          setError(
            "We could not check your earlier drawing yet. Check its status before sending another.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setRecovering(false);
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [savedRequest, jobId, id, token, recoverVersion, jobKey]);
  useEffect(() => {
    if (!jobId) return;
    const ctrl = new AbortController();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    async function read() {
      try {
        const next = await api<Job>(
          `/api/worlds/${id}/jobs/${jobId}`,
          { signal: ctrl.signal },
          token,
        );
        if (!cancelled) {
          setJob(next);
          setStatusError("");
          failures = 0;
          if (!["completed", "failed", "uncertain"].includes(next.status))
            timer = setTimeout(read, 2500);
        }
      } catch (e) {
        if (!cancelled) {
          setStatusError(
            e instanceof Error ? e.message : "Could not check your drawing.",
          );
          if (++failures < 5)
            timer = setTimeout(read, Math.min(3000 * 2 ** failures, 30000));
        }
      }
    }
    void read();
    return () => {
      cancelled = true;
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [jobId, id, token, retryStatus]);
  async function choose(file?: File) {
    if (!file || active) return;
    const version = ++chooseVersion.current;
    setPreparing(true);
    setError("");
    setInvalid("");
    try {
      const image = await normalizePhoto(file);
      if (alive.current && version === chooseVersion.current) {
        setPhoto(image);
        setFileName(file.name);
      }
    } catch (e) {
      if (alive.current && version === chooseVersion.current)
        setError(
          e instanceof Error
            ? e.message
            : "This photo could not be opened. Choose a JPG or PNG.",
        );
    } finally {
      if (alive.current && version === chooseVersion.current)
        setPreparing(false);
    }
  }
  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (submitLock.current || preparing || jobId) return;
    if (!photo) {
      setInvalid("photo");
      photoInput.current?.focus();
      return;
    }
    if (!name.trim()) {
      setInvalid("name");
      nameInput.current?.focus();
      return;
    }
    submitLock.current = true;
    setSending(true);
    setError("");
    try {
      sessionStorage.setItem(requestKey, requestId);
    } catch {
      setStorageWarning(
        "This browser cannot save recovery information. Keep this page open until your drawing has arrived.",
      );
    }
    try {
      const result = await api<Job>(
        `/api/worlds/${id}/jobs`,
        {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            appearance,
            image: photo,
            requestId,
          }),
        },
        token,
      );
      if (alive.current) {
        setUncertain(false);
        setJob(result);
        setJobId(result.id);
        try {
          sessionStorage.setItem(jobKey, result.id);
        } catch {}
      }
    } catch (e) {
      if (alive.current) {
        setError(
          e instanceof Error ? e.message : "Your drawing could not be sent.",
        );
        setUncertain(e instanceof ApiError && e.status === 0);
      }
    } finally {
      submitLock.current = false;
      if (alive.current) setSending(false);
    }
  }
  function reset() {
    setSavedRequest("");
    try {
      sessionStorage.removeItem(jobKey);
      sessionStorage.removeItem(requestKey);
    } catch {}
    setJobId("");
    setJob(undefined);
    setPhoto("");
    setName("");
    setFileName("");
    setError("");
    setUncertain(false);
    setRequestId(crypto.randomUUID());
    if (photoInput.current) photoInput.current.value = "";
  }
  const status = job ? statusCopy[job.status] : null;
  return (
    <div className={`join-page theme-${world?.theme || "aquarium"}`}>
      <header className="join-header">
        <Brand />
        <span className="small-badge">A world is waiting</span>
      </header>
      <main className="join-main">
        <div className="join-hero">
          <span className="eyebrow">YOU’RE INVITED TO</span>
          <h1>{world?.name || "A little world"}</h1>
          <p>One drawing. A whole new adventure.</p>
          <div className="join-scene-strip">
            <img src={`/${world?.theme || "aquarium"}.svg`} alt="" />
            <img
              className="join-sample"
              src={`/sample-${themes[world?.theme || "aquarium"].sample}.svg`}
              alt="Illustrative sample character"
            />
            <span>Illustrative sample</span>
          </div>
        </div>
        {session.demo && (
          <Notice>
            <strong>Preview mode.</strong> This uses local sample processing,
            not live Higgsfield AI.
          </Notice>
        )}
        {resource.error && (
          <Notice error>
            {resource.error}
            <Button onClick={resource.refresh}>Check invitation again</Button>
          </Notice>
        )}
        {recovering ? (
          <Loading label="Checking your earlier drawing…" />
        ) : resource.loading && !world ? (
          <Loading />
        ) : !world ? null : jobId ? (
          <section className="arrival-panel" aria-live="polite">
            <span
              className={`arrival-icon ${job?.status === "completed" ? "is-complete" : ""}`}
            >
              <Icon
                name={job?.status === "completed" ? "check" : "spark"}
                size={34}
              />
            </span>
            <span className="eyebrow">
              {job?.name || name || "YOUR DRAWING"}
            </span>
            <h2>{status?.title || "Checking your drawing…"}</h2>
            <p>
              {session.demo && job?.status === "processing"
                ? "Preparing your local preview character. No live AI request is being made."
                : status?.body ||
                  "Restoring the latest status of your drawing."}
            </p>
            {["queued", "submitting", "processing"].includes(
              job?.status || "",
            ) && (
              <div className="arrival-steps">
                <span className="done">Received</span>
                <i />
                <span className={job?.status === "processing" ? "done" : ""}>
                  Coming to life
                </span>
                <i />
                <span>In the world</span>
              </div>
            )}
            {statusError && (
              <Notice error>
                {statusError}
                <Button onClick={() => setRetryStatus((n) => n + 1)}>
                  Check status again
                </Button>
              </Notice>
            )}
            {job?.message && ["failed", "uncertain"].includes(job.status) && (
              <Notice error>{job.message}</Notice>
            )}
            {job?.status === "completed" && (
              <Button intent="primary" onClick={reset}>
                Add another drawing
                <Icon name="plus" />
              </Button>
            )}
            {job?.status === "failed" && (
              <Button onClick={reset}>Choose another drawing</Button>
            )}
            {job?.status === "uncertain" && (
              <Button onClick={() => setRetryStatus((n) => n + 1)}>
                Check status again
              </Button>
            )}
          </section>
        ) : (
          <form className="upload-form" noValidate onSubmit={send}>
            {!world.uploadsOpen && (
              <Notice>
                Uploads are paused by the host. Your drawing stays here until
                they reopen.
              </Notice>
            )}
            {!session.generationReady && !session.demo && (
              <Notice>
                Drawing generation isn’t connected yet. Ask the host to finish
                setting it up.
              </Notice>
            )}
            <div className="upload-step-label">
              <span>1</span>
              <h2>Show us your drawing</h2>
            </div>
            <p className="field-hint">
              One character, good light, and as little background as possible.
            </p>
            <div
              className={`photo-drop ${dragging ? "drag-over" : ""} ${photo ? "has-photo" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (!active) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                void choose(e.dataTransfer.files[0]);
              }}
            >
              {photo ? (
                <img
                  className="photo-preview"
                  src={photo}
                  alt="Your selected drawing"
                />
              ) : (
                <div className="photo-placeholder">
                  <span className="photo-sketch">
                    <Icon name="pencil" size={38} />
                    <i>✳</i>
                  </span>
                  <strong>A masterpiece in the making.</strong>
                  <span>Take a photo or choose one you’ve saved.</span>
                </div>
              )}
              <label
                className={`button button-${photo ? "neutral" : "primary"} upload-picker ${active ? "disabled" : ""}`}
                htmlFor="drawing-photo"
              >
                <Icon name="upload" />
                {preparing
                  ? "Preparing photo…"
                  : photo
                    ? "Choose another photo"
                    : "Choose a photo"}
                <input
                  ref={photoInput}
                  type="file"
                  id="drawing-photo"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  disabled={active || preparing}
                  onChange={(e) => void choose(e.target.files?.[0])}
                  aria-invalid={invalid === "photo"}
                  aria-describedby="photo-help"
                />
              </label>
            </div>
            <p className="field-hint" id="photo-help">
              {invalid === "photo" ? (
                <span className="field-error">
                  Choose a drawing photo first.
                </span>
              ) : (
                fileName || "JPG, PNG, or WebP · one photo · up to 25 MB"
              )}
            </p>
            <div className="upload-step-label">
              <span>2</span>
              <h2>Give it a personality</h2>
            </div>
            <label className="field-label" htmlFor="character-name">
              What’s their name?
            </label>
            <input
              id="character-name"
              ref={nameInput}
              value={name}
              maxLength={50}
              disabled={active}
              onChange={(e) => {
                setName(e.target.value);
                setInvalid("");
              }}
              placeholder="e.g. Captain Bubbles"
              aria-invalid={invalid === "name"}
              aria-describedby={invalid === "name" ? "name-error" : undefined}
            />
            {invalid === "name" && (
              <span id="name-error" className="field-error">
                Give your character a name.
              </span>
            )}
            <fieldset className="appearance-field" disabled={active}>
              <legend>How should they look?</legend>
              <div className="appearance-options">
                <label className={appearance === "handmade" ? "selected" : ""}>
                  <input
                    type="radio"
                    name="appearance"
                    checked={appearance === "handmade"}
                    onChange={() => setAppearance("handmade")}
                  />
                  <Icon name="pencil" size={25} />
                  <strong>Keep my drawing</strong>
                  <span>All the charm. Every little line.</span>
                  <i>
                    <Icon name="check" size={12} />
                  </i>
                </label>
                <label className={appearance === "polished" ? "selected" : ""}>
                  <input
                    type="radio"
                    name="appearance"
                    checked={appearance === "polished"}
                    onChange={() => setAppearance("polished")}
                  />
                  <Icon name="spark" size={25} />
                  <strong>A little more magic</strong>
                  <span>A polished character, inspired by you.</span>
                  <i>
                    <Icon name="check" size={12} />
                  </i>
                </label>
              </div>
            </fieldset>
            {storageWarning && <Notice>{storageWarning}</Notice>}
            {error && <Notice error>{error}</Notice>}
            {uncertain ? (
              <div className="retry-area">
                <Notice>
                  The connection stopped before we could confirm receipt. This
                  checks the same drawing request and won’t create a duplicate.
                </Notice>
                <Button
                  intent="primary"
                  type="button"
                  busy={sending}
                  onClick={() =>
                    photo ? void send() : setRecoverVersion((n) => n + 1)
                  }
                >
                  {photo
                    ? "Check and retry this drawing"
                    : "Check earlier drawing"}
                </Button>
              </div>
            ) : (
              <Button
                className="upload-submit"
                type="submit"
                intent="primary"
                busy={sending}
                disabled={
                  preparing ||
                  !world.uploadsOpen ||
                  (!session.generationReady && !session.demo)
                }
              >
                Bring my drawing to life
                <Icon name="spark" />
              </Button>
            )}
            <p className="cost-note">
              {session.demo
                ? "Preview processing uses no live AI generation."
                : "The host pays for Higgsfield AI generation. Only upload a drawing you have permission to use."}
            </p>
          </form>
        )}
      </main>
      <footer className="join-footer">
        Made by you. Brought to life with <strong>Higgsfield API.</strong>
      </footer>
    </div>
  );
}
