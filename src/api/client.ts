import { API_BASE } from "../config/api";

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type ApiErrorBody = {
  detail?: string | { msg?: string }[];
  code?: string;
};

const RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);

export type ApiRequestOptions = {
  /** Extra attempts after the first failure (default 0). */
  retries?: number;
  retryDelayMs?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function parseError(response: Response): Promise<ApiError> {
  try {
    const data = (await response.json()) as ApiErrorBody;
    if (typeof data.detail === "string") {
      return new ApiError(data.detail, response.status, data.code);
    }
    if (Array.isArray(data.detail) && data.detail[0]?.msg) {
      return new ApiError(data.detail[0].msg, response.status, data.code);
    }
  } catch {
    // ignore parse errors
  }
  return new ApiError(response.statusText || "Request failed", response.status);
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return RETRYABLE_STATUSES.has(error.status);
  }
  return error instanceof TypeError;
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
  token?: string | null,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { retries = 0, retryDelayMs = 1_200 } = options;
  const maxAttempts = 1 + retries;
  let lastError: ApiError | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const headers = new Headers(init?.headers);
      if (!headers.has("Content-Type") && init?.body) {
        headers.set("Content-Type", "application/json");
      }
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }

      const response = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers,
        cache: "no-store",
      });

      if (!response.ok) {
        lastError = await parseError(response);
        if (isRetryableError(lastError) && attempt < maxAttempts - 1) {
          await sleep(retryDelayMs * (attempt + 1));
          continue;
        }
        throw lastError;
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return response.json() as Promise<T>;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      if (attempt < maxAttempts - 1) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }

      throw error instanceof Error ? error : new Error("Network request failed");
    }
  }

  throw lastError ?? new Error("Request failed");
}
