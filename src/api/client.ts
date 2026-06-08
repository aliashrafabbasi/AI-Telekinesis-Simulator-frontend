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

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
  token?: string | null,
): Promise<T> {
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
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
