import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(async () => "encoded-credentials"),
}));

import { dataforseoGet, dataforseoPost } from "@/server/lib/dataforseo/core";
import { getRequiredEnvValue } from "@/server/lib/runtime-env";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DataForSEO transport", () => {
  it("retries a transient 5xx on idempotent reads and returns the parsed envelope", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("upstream failure", { status: 503 }))
      .mockResolvedValueOnce(Response.json({ status_code: 20000, tasks: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      dataforseoPost("/v3/backlinks/summary/live", []),
    ).resolves.toEqual({ status_code: 20000, tasks: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.dataforseo.com/v3/backlinks/summary/live");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Basic encoded-credentials",
    );
  });

  // The request-deadline abort arrives as a bare DOMException. Left unclassified
  // it escapes as an anonymous INTERNAL_ERROR; retrying it would replay a call
  // DataForSEO may already have billed. Both names are reachable: the shared
  // budget aborts with TimeoutError, Lighthouse's own controller with AbortError.
  it.each(["TimeoutError", "AbortError"])(
    "maps a %s abort to UPSTREAM_UNAVAILABLE without retrying",
    async (name) => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockRejectedValue(new DOMException("aborted", name));
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        dataforseoPost("/v3/serp/google/organic/live/advanced", []),
      ).rejects.toMatchObject({
        code: "UPSTREAM_UNAVAILABLE",
        name: "DataForSEOTimeoutError",
      });
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );
});

describe("DataForSEO through treg", () => {
  it.each([
    [
      "/v3/dataforseo_labs/google/ranked_keywords/live",
      "https://treg.to/call/dataforseo.google.domain.ranked_keywords",
    ],
    [
      "/v3/serp/google/locations/tr",
      "https://treg.to/call/dataforseo.x.serp-google-locations-country?country=tr",
    ],
  ])(
    "sends %s to its treg endpoint with the treg token",
    async (path, tregUrl) => {
      vi.mocked(getRequiredEnvValue).mockResolvedValueOnce("treg:token");
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ status_code: 20000, tasks: [] }));
      vi.stubGlobal("fetch", fetchMock);

      await dataforseoGet(path);

      const [url, init] = fetchMock.mock.calls[0];
      const headers = new Headers(init?.headers);
      expect(url).toBe(tregUrl);
      expect(headers.get("X-Treg-Token")).toBe("token");
      expect(headers.get("Authorization")).toBeNull();
    },
  );

  // treg has no task_get, so a queued task would be billed and never
  // collected; and a sandbox probe must not turn into a billed live call.
  it.each([
    ["/v3/serp/google/organic/task_post", undefined],
    ["/v3/serp/google/organic/live/advanced", "https://sandbox.dataforseo.com"],
  ])("refuses %s (%s) without calling treg", async (path, baseUrl) => {
    vi.mocked(getRequiredEnvValue).mockResolvedValueOnce("treg:token");
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await expect(dataforseoPost(path, [], { baseUrl })).rejects.toMatchObject({
      code: "UPSTREAM_UNAVAILABLE",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
