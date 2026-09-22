import { describe, expect, it } from "vitest";
import { isOwner, requireSameOrigin } from "../src/server/security";
describe("owner boundary", () => {
  it("does not allow the local development bypass on a hosted origin", () => {
    expect(
      isOwner(new Request("https://world.example/api/worlds"), {
        ALLOW_LOCAL_OWNER: "true",
      }),
    ).toBe(false);
  });
  it("requires an explicitly configured owner and matching trusted identity", () => {
    const request = new Request("https://world.example/api/worlds", {
      headers: { "oai-authenticated-user-email": "guest@example.com" },
    });
    expect(isOwner(request, {})).toBe(false);
    expect(isOwner(request, { OWNER_EMAIL: "owner@example.com" })).toBe(false);
    expect(isOwner(request, { OWNER_EMAIL: "guest@example.com" })).toBe(true);
  });
  it("rejects cross-origin state changes, including a missing origin", () => {
    for (const origin of ["https://attacker.example", null]) {
      const request = new Request("https://world.example/api/worlds", {
        method: "POST",
        headers: origin ? { origin } : {},
      });
      expect(() => requireSameOrigin(request)).toThrow();
    }
    expect(() =>
      requireSameOrigin(
        new Request("https://world.example/api/worlds", {
          method: "POST",
          headers: { origin: "https://world.example" },
        }),
      ),
    ).not.toThrow();
  });
});
