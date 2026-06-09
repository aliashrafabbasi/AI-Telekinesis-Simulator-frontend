import { API_BASE } from "../config/api";

const WARMUP_TIMEOUT_MS = 10_000;

/** Best-effort ping so cold backends (e.g. HF Spaces) wake before auth. */
export async function warmApi(): Promise<void> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), WARMUP_TIMEOUT_MS);

  try {
    await fetch(`${API_BASE}/health/live`, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
  } catch {
    // Ignore — login/register retries handle a still-cold API.
  } finally {
    window.clearTimeout(timeout);
  }
}
