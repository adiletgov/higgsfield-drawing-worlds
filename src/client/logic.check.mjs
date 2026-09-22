import test from "node:test";
import assert from "node:assert/strict";
import { fitImage, parseRoute, accessLink, safeAssetPath } from "./logic.ts";

test("large photographs shrink proportionately without enlarging small drawings", () => {
  assert.deepEqual(fitImage(4000, 3000), { width: 1024, height: 768 });
  assert.deepEqual(fitImage(300, 800), { width: 300, height: 800 });
  assert.throws(() => fitImage(0, 2));
});
test("only known world routes accept a world identity", () => {
  assert.deepEqual(parseRoute("/join/abc-123"), {
    kind: "join",
    id: "abc-123",
  });
  assert.deepEqual(parseRoute("/world/abc-123"), {
    kind: "world",
    id: "abc-123",
  });
  assert.deepEqual(parseRoute("/"), { kind: "owner" });
  assert.deepEqual(parseRoute("/join/a/../../api"), { kind: "missing" });
});
test("share credentials stay in fragments and cannot alter path or query", () => {
  assert.equal(
    accessLink("https://world.test", "join", "abc", "secret+/="),
    "https://world.test/join/abc#secret%2B%2F%3D",
  );
});
test("asset fetch cannot send a bearer credential to a remote origin or another world", () => {
  assert.equal(
    safeAssetPath("/api/worlds/abc/assets/123", "abc"),
    "/api/worlds/abc/assets/123",
  );
  assert.throws(() => safeAssetPath("https://evil.test/asset", "abc"));
  assert.throws(() => safeAssetPath("/api/worlds/xyz/assets/123", "abc"));
});
test("video posters use the same strict world boundary as the video asset", () => {
  assert.equal(
    safeAssetPath("/api/worlds/abc/posters/123", "abc"),
    "/api/worlds/abc/posters/123",
  );
  for (const path of [
    "/api/worlds/xyz/posters/123",
    "/api/worlds/abc/posters/../123",
    "/api/worlds/abc/posters/123?token=secret",
    "//evil.test/api/worlds/abc/posters/123",
    "/api/worlds/abc/posters/%2e%2e",
    "/api/worlds/abc/posters/123/extra",
  ]) {
    assert.throws(() => safeAssetPath(path, "abc"));
  }
});

// These break if a pre-mutation poll or its error may publish after newer state.
test("a late pre-reveal poll cannot replace the confirmed revealed portrait", async () => {
  const { createPublicationGate } = await import("./resource-publication.ts");
  const gate = createPublicationGate();
  let displayed = { id: "portrait-a", revealed: false };
  let releasePoll;
  const oldPoll = new Promise((resolve) => {
    releasePoll = resolve;
  });
  const publish = gate.begin();
  const reading = oldPoll.then((value) =>
    publish(() => {
      displayed = value;
    }),
  );
  gate.invalidate();
  displayed = { id: "portrait-a", revealed: true };
  releasePoll({ id: "portrait-a", revealed: false });
  await reading;
  assert.deepEqual(displayed, { id: "portrait-a", revealed: true });
});
test("a superseded room read cannot publish an error over the newly opened room", async () => {
  const { createPublicationGate } = await import("./resource-publication.ts");
  const gate = createPublicationGate();
  let error = "";
  const oldRoom = gate.begin();
  gate.invalidate();
  const nextRoom = gate.begin();
  nextRoom(() => {
    error = "";
  });
  oldRoom(() => {
    error = "Old room connection failed";
  });
  assert.equal(error, "");
});
