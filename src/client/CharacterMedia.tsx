import { useEffect, useRef, useState } from "react";
import type { Character } from "../shared";
import { safeAssetPath } from "./logic";
import { createLoopPlayback, shouldPlayLoop } from "./playback";
import { Button, Icon } from "./ui";

function useMediaAsset(
  path: string | undefined,
  worldId: string,
  token?: string,
) {
  const [asset, setAsset] = useState({ identity: "", url: "", failed: false });
  const [attempt, setAttempt] = useState(0);
  const identity = `${worldId}:${path || ""}:${token || ""}:${attempt}`;
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    let objectUrl = "";
    let disposed = false;
    void (async () => {
      try {
        const response = await fetch(safeAssetPath(path, worldId), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(40000),
          ]),
          credentials: "same-origin",
        });
        if (!response.ok) throw new Error("Unavailable");
        const blob = await response.blob();
        if (!disposed) {
          objectUrl = URL.createObjectURL(blob);
          setAsset({ identity, url: objectUrl, failed: false });
        }
      } catch {
        if (!disposed) setAsset({ identity, url: "", failed: true });
      }
    })();
    return () => {
      disposed = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, worldId, token, attempt, identity]);
  const current =
    asset.identity === identity ? asset : { url: "", failed: false };
  return { ...current, reload: () => setAttempt((value) => value + 1) };
}

type CharacterMediaProps = {
  character: Character;
  worldId: string;
  token?: string;
  className?: string;
  label?: string;
};

// Lists and legacy scenes intentionally use the poster, never a grid of autoplaying videos.
export function CharacterImage({
  character,
  worldId,
  token,
  className = "",
  label,
}: CharacterMediaProps) {
  const path =
    character.mediaType === "video" ? character.posterUrl : character.assetUrl;
  const asset = useMediaAsset(path, worldId, token);
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [asset.url]);
  const description = label || character.name;
  if (!path || asset.failed || broken)
    return (
      <button
        className="character-unavailable"
        onClick={() => {
          setBroken(false);
          asset.reload();
        }}
        aria-label={`Reload image for ${description}`}
      >
        ↻<span>{description}</span>
      </button>
    );
  return asset.url ? (
    <img
      src={asset.url}
      alt={description}
      className={className}
      draggable="false"
      onError={() => setBroken(true)}
    />
  ) : (
    <span
      className="character-loading"
      role="status"
      aria-label={`Loading ${description}`}
    />
  );
}

export function CharacterMedia(
  props: CharacterMediaProps & { paused?: boolean },
) {
  return props.character.mediaType === "video" ? (
    <CharacterVideo key={props.character.id} {...props} />
  ) : (
    <CharacterImage {...props} />
  );
}

function CharacterVideo({
  character,
  worldId,
  token,
  label,
  paused = false,
}: CharacterMediaProps & { paused?: boolean }) {
  const media = useMediaAsset(character.assetUrl, worldId, token);
  const poster = useMediaAsset(character.posterUrl, worldId, token);
  const [reducedMotion, setReducedMotion] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [requested, setRequested] = useState(false);
  const [localPaused, setLocalPaused] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [broken, setBroken] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const playback = useRef<ReturnType<typeof createLoopPlayback> | null>(null);
  const shouldPlay = shouldPlayLoop({
    paused: paused || localPaused,
    reducedMotion,
    requested,
  });
  const description = label || character.name;
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReducedMotion(preference.matches);
      if (preference.matches) setRequested(false);
    };
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!video.current || !media.url) return;
    const control = createLoopPlayback(video.current, () => setBlocked(true));
    playback.current = control;
    return () => {
      control.dispose();
      playback.current = null;
    };
  }, [media.url]);
  useEffect(() => {
    playback.current?.setPlaying(shouldPlay && !broken);
  }, [shouldPlay, broken, media.url, attempt]);
  const failed = media.failed || broken;
  const showPoster =
    !media.url || failed || blocked || (reducedMotion && !requested);
  return (
    <div className="character-video">
      {media.url && (
        <video
          ref={video}
          src={media.url}
          poster={poster.url || undefined}
          muted
          autoPlay={shouldPlay && !blocked && !broken}
          loop
          playsInline
          preload="auto"
          aria-label={`${description}. Silent five-second cartoon animation.`}
          onPlay={() => {
            setPlaying(true);
            setBlocked(false);
          }}
          onPause={() => setPlaying(false)}
          onError={() => {
            setBroken(true);
            setPlaying(false);
          }}
        />
      )}
      {showPoster && poster.url && (
        <img
          className="video-poster"
          src={poster.url}
          alt={description}
          draggable="false"
        />
      )}
      {!media.url && !poster.url && !failed && (
        <span
          className="character-loading"
          role="status"
          aria-label={`Loading ${description}`}
        />
      )}
      {failed && !poster.url && (
        <span className="media-fallback">The animation could not load.</span>
      )}
      <div className="media-controls">
        <Button
          className="media-toggle"
          disabled={paused || (!media.url && !failed)}
          aria-label={
            failed
              ? "Reload animation"
              : paused
                ? "Screen animation paused"
                : playing
                  ? "Pause this animation"
                  : "Play this animation"
          }
          onClick={() => {
            if (failed) {
              setBroken(false);
              setBlocked(false);
              media.reload();
              if (poster.failed) poster.reload();
            } else if (playing) {
              setLocalPaused(true);
              playback.current?.setPlaying(false);
            } else {
              setRequested(true);
              setLocalPaused(false);
              setBlocked(false);
              playback.current?.setPlaying(true);
              setAttempt((value) => value + 1);
            }
          }}
        >
          <Icon name={playing && !failed ? "pause" : "play"} size={14} />
          {failed
            ? "Reload animation"
            : paused
              ? "Paused"
              : !media.url
                ? "Loading animation…"
                : playing
                  ? "Pause"
                  : "Play animation"}
        </Button>
        {(failed || blocked) && (
          <span role="status">
            {failed
              ? poster.url
                ? "Showing the still portrait while playback is unavailable."
                : "Playback unavailable. Try reloading the animation."
              : "Tap Play to start the animation."}
          </span>
        )}
      </div>
    </div>
  );
}
