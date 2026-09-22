import test from "node:test";
import assert from "node:assert/strict";
import { partyPresentation } from "./party.ts";
import { createLoopPlayback, shouldPlayLoop } from "./playback.ts";
const drawings = [
  {
    id: "a",
    name: "Alex",
    appearance: "handmade",
    assetUrl: "/api/worlds/p/assets/a",
    createdAt: "2026-09-22T00:00:00Z",
  },
  {
    id: "b",
    name: "Sam",
    appearance: "polished",
    assetUrl: "/api/worlds/p/assets/b",
    createdAt: "2026-09-22T00:01:00Z",
  },
];
test("unrevealed active drawing never exposes the answer in visible or accessible text", () => {
  const view = partyPresentation(
    { activeCharacterId: "a", revealed: false, round: 1, total: 2 },
    drawings,
  );
  assert.equal(view.answer, undefined);
  assert.equal(view.portraitLabel, "Mystery party portrait");
  assert.equal(view.canReveal, true);
  assert.equal(view.canNext, false);
  assert.equal(view.queued, 1);
});
test("reveal shows the current answer and enables next without changing the active drawing", () => {
  const view = partyPresentation(
    { activeCharacterId: "b", revealed: true, round: 2, total: 2 },
    drawings,
  );
  assert.equal(view.active.id, "b");
  assert.equal(view.answer, "Sam");
  assert.equal(view.portraitLabel, "Portrait of Sam");
  assert.equal(view.canReveal, false);
  assert.equal(view.canNext, true);
  assert.equal(view.queued, 0);
});
test("empty or stale active identity cannot enable a round action", () => {
  for (const state of [
    undefined,
    { activeCharacterId: null, revealed: false, round: 2, total: 2 },
    { activeCharacterId: "missing", revealed: false, round: 1, total: 0 },
  ]) {
    const view = partyPresentation(state, drawings);
    assert.equal(view.canReveal, false);
    assert.equal(view.canNext, false);
    assert.equal(view.answer, undefined);
    assert.equal(view.queued, 0);
  }
});
test("a loop stays still for reduced motion or global pause unless motion is explicitly requested", () => {
  assert.equal(
    shouldPlayLoop({ paused: false, reducedMotion: false, requested: false }),
    true,
  );
  assert.equal(
    shouldPlayLoop({ paused: false, reducedMotion: true, requested: false }),
    false,
  );
  assert.equal(
    shouldPlayLoop({ paused: false, reducedMotion: true, requested: true }),
    true,
  );
  assert.equal(
    shouldPlayLoop({ paused: true, reducedMotion: false, requested: true }),
    false,
  );
});
test("pausing during delayed playback prevents the late start from restarting motion", async () => {
  let resolvePlay;
  let moving = false;
  const media = {
    play: () =>
      new Promise((resolve) => {
        resolvePlay = () => {
          moving = true;
          resolve();
        };
      }),
    pause: () => {
      moving = false;
    },
  };
  const playback = createLoopPlayback(media, () =>
    assert.fail("Unexpected blocked state"),
  );
  playback.setPlaying(true);
  playback.setPlaying(false);
  resolvePlay();
  await Promise.resolve();
  assert.equal(moving, false);
  playback.dispose();
});
test("blocked autoplay offers recovery while a disposed portrait ignores late rejection", async () => {
  let blocked = 0;
  let rejectPlay;
  const media = {
    play: () =>
      new Promise((_resolve, reject) => {
        rejectPlay = reject;
      }),
    pause() {},
  };
  const playback = createLoopPlayback(media, () => {
    blocked++;
  });
  playback.setPlaying(true);
  rejectPlay(new Error("Autoplay blocked"));
  await Promise.resolve();
  assert.equal(blocked, 1);
  playback.setPlaying(true);
  playback.dispose();
  rejectPlay(new Error("Old portrait"));
  await Promise.resolve();
  assert.equal(blocked, 1);
});
test("a disposed playback owner cannot pause a new owner of the same video element", async () => {
  const starts = [];
  let moving = false;
  const media = {
    play: () =>
      new Promise((resolve) =>
        starts.push(() => {
          moving = true;
          resolve();
        }),
      ),
    pause: () => {
      moving = false;
    },
  };
  const oldPlayback = createLoopPlayback(media, () => {});
  oldPlayback.setPlaying(true);
  oldPlayback.dispose();
  const currentPlayback = createLoopPlayback(media, () => {});
  currentPlayback.setPlaying(true);
  starts[1]();
  await Promise.resolve();
  starts[0]();
  await Promise.resolve();
  assert.equal(moving, true);
  currentPlayback.dispose();
  assert.equal(moving, false);
});
