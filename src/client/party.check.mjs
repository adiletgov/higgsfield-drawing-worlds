import test from "node:test";
import assert from "node:assert/strict";
import { partyPresentation } from "./party.ts";
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
