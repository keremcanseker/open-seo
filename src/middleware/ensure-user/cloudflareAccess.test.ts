import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("./delegated", () => ({ resolveSharedWorkspaceContext: vi.fn() }));

const { accessIdentity } = await import("./cloudflareAccess");

describe("accessIdentity", () => {
  it("uses sub and email for people", () => {
    expect(accessIdentity({ sub: "u1", email: "a@b.co" })).toEqual({
      userId: "u1",
      userEmail: "a@b.co",
    });
  });

  it("rejects a person token without an email", () => {
    expect(accessIdentity({ sub: "u1" })).toBeNull();
  });

  it("maps a service token to its client id", () => {
    expect(accessIdentity({ sub: "", common_name: "abc.access" })).toEqual({
      userId: "service-token:abc.access",
      userEmail: "abc.access@service-token.invalid",
    });
  });

  it("rejects a token with neither", () => {
    expect(accessIdentity({ sub: "" })).toBeNull();
  });
});
