import { apiRequest } from "./client";
import type { LoginPayload, LoginResponse, RegisterPayload } from "../types/auth";
import type { User } from "../types/auth";

export { ApiError } from "./client";

/** Cold hosts (HF Spaces) often 500 on the first request after idle. */
const AUTH_REQUEST_OPTIONS = { retries: 2, retryDelayMs: 1_000 };

export async function register(payload: RegisterPayload): Promise<LoginResponse> {
  return apiRequest<LoginResponse>(
    "/auth/register",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    undefined,
    AUTH_REQUEST_OPTIONS,
  );
}

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  return apiRequest<LoginResponse>(
    "/auth/login",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    undefined,
    AUTH_REQUEST_OPTIONS,
  );
}

export async function fetchMe(token: string): Promise<User> {
  return apiRequest<User>("/auth/me", undefined, token, AUTH_REQUEST_OPTIONS);
}
