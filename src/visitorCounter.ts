export type VisitorCounterStatus = "loading" | "ready" | "local" | "unavailable";

export interface VisitorCounterResult {
  status: VisitorCounterStatus;
  label: string;
  count: number | null;
}

export const COUNTER_ENDPOINT = "https://countapi.mileshilliard.com/api/v1/hit";

export function isLocalHostname(hostname: string): boolean {
  return hostname === "" || hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function visitorCounterKey(hostname: string): string {
  return `interactive-circle-of-fifths-${hostname}`;
}

export async function hitVisitorCounter(
  hostname: string,
  fetcher: typeof fetch = fetch
): Promise<VisitorCounterResult> {
  if (isLocalHostname(hostname)) {
    return {
      status: "local",
      label: "Local preview",
      count: null
    };
  }

  try {
    const response = await fetcher(`${COUNTER_ENDPOINT}/${encodeURIComponent(visitorCounterKey(hostname))}`);

    if (!response.ok) {
      throw new Error(`Counter request failed: ${response.status}`);
    }

    const data = (await response.json()) as { value?: number | string };
    const count = Number(data.value);

    if (!Number.isFinite(count)) {
      throw new Error("Counter response did not include a numeric value.");
    }

    return {
      status: "ready",
      label: `Visits: ${count.toLocaleString()}`,
      count
    };
  } catch {
    return {
      status: "unavailable",
      label: "Visits unavailable",
      count: null
    };
  }
}
