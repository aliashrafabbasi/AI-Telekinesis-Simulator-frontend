import { apiRequest } from "./client";
import type { LoginPayload, LoginResponse, RegisterPayload } from "../types/auth";
import type { User } from "../types/auth";

export { ApiError } from "./client";

export async function register(payload: RegisterPayload): Promise<LoginResponse> {
  return apiRequest<LoginResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  return apiRequest<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchMe(token: string): Promise<User> {
  return apiRequest<User>("/auth/me", undefined, token);
}
