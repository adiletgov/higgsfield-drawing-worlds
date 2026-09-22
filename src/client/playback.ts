interface Playable {
  play(): Promise<void>;
  pause(): void;
}
const owners = new WeakMap<Playable, symbol>();
export function shouldPlayLoop({
  paused,
  reducedMotion,
  requested,
}: {
  paused: boolean;
  reducedMotion: boolean;
  requested: boolean;
}) {
  return !paused && (!reducedMotion || requested);
}
export function createLoopPlayback(media: Playable, onBlocked: () => void) {
  const owner = Symbol();
  owners.set(media, owner);
  let disposed = false;
  let desired = false;
  let revision = 0;
  return {
    setPlaying(playing: boolean) {
      if (disposed) return;
      desired = playing;
      const request = ++revision;
      if (!playing) {
        media.pause();
        return;
      }
      void media.play().then(
        () => {
          if (owners.get(media) === owner && (disposed || !desired))
            media.pause();
        },
        () => {
          if (!disposed && desired && request === revision) onBlocked();
        },
      );
    },
    dispose() {
      disposed = true;
      desired = false;
      revision++;
      media.pause();
    },
  };
}
