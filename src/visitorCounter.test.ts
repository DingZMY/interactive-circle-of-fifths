import { describe, expect, it, vi } from "vitest";
import { hitVisitorCounter, isLocalHostname, visitorCounterKey } from "./visitorCounter";

describe("visitor counter", () => {
  it("detects local hostnames", () => {
    expect(isLocalHostname("localhost")).toBe(true);
    expect(isLocalHostname("127.0.0.1")).toBe(true);
    expect(isLocalHostname("example.com")).toBe(false);
  });

  it("uses a stable public counter key", () => {
    expect(visitorCounterKey("example.com")).toBe("interactive-circle-of-fifths-example.com");
  });

  it("does not hit the network for localhost", async () => {
    const fetcher = vi.fn();
    const result = await hitVisitorCounter("localhost", fetcher);

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.status).toBe("local");
  });

  it("returns the visit count in production", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ value: "42" })
    });
    const result = await hitVisitorCounter("example.com", fetcher);

    expect(fetcher).toHaveBeenCalledWith(
      "https://countapi.mileshilliard.com/api/v1/hit/interactive-circle-of-fifths-example.com"
    );
    expect(result.status).toBe("ready");
    expect(result.count).toBe(42);
  });

  it("falls back when the counter request fails", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("network"));
    const result = await hitVisitorCounter("example.com", fetcher);

    expect(result.status).toBe("unavailable");
  });
});
