/**
 * HTTP client for the backend.
 *
 * - Adds the active account's token (store/accounts.ts).
 * - Turns failed responses into ApiError carrying the backend's error `code` and `params`,
 *   which the UI translates (see i18n/errors.ts).
 * - A 401 on an authenticated request signs the account out (handler set by App).
 */
import { accountStore, getActiveToken } from "../store/accounts";
import { getActiveWorkspaceId, workspaceStore } from "../store/workspace";

const BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "";

export class ApiError extends Error {
  /** HTTP status; 0 means the server could not be reached. */
  readonly status: number;
  readonly code: string;
  readonly params: Record<string, unknown>;

  constructor(status: number, message: string, code = "", params: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.params = params;
  }
}

let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

interface ErrorBody {
  detail?: unknown;
  code?: unknown;
  params?: unknown;
}

function messageFromDetail(detail: unknown, status: number): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item: { loc?: unknown[]; msg?: string }) => {
        const loc = Array.isArray(item?.loc) ? item.loc : [];
        const field = loc.length > 1 ? String(loc[loc.length - 1]) : "";
        const message = String(item?.msg ?? "").replace(/^Value error, /, "");
        return field ? `${field}: ${message}` : message;
      })
      .join("; ");
  }
  return `Request failed with status ${status}.`;
}

export function toApiError(status: number, body: unknown): ApiError {
  const data = (body && typeof body === "object" ? body : {}) as ErrorBody;
  return new ApiError(
    status,
    messageFromDetail(data.detail, status),
    typeof data.code === "string" ? data.code : "",
    data.params && typeof data.params === "object" ? (data.params as Record<string, unknown>) : {},
  );
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  /** false for login/register: no token is sent and a 401 does not sign anyone out. */
  auth?: boolean;
  /** Use this token instead of the active account's. */
  token?: string;
  signal?: AbortSignal;
}

export function authHeaders(options: Pick<RequestOptions, "auth" | "token"> = {}): Record<string, string> {
  const token = options.token ?? (options.auth === false ? null : getActiveToken());
  if (!token) return {};
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  // Requests for another account (options.token) use that account's default workspace.
  const workspaceId = options.token ? null : getActiveWorkspaceId();
  if (workspaceId != null) headers["X-Workspace-Id"] = String(workspaceId);
  return headers;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { ...authHeaders(options) };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "Cannot reach the server.", "network");
  }

  if (response.status === 204) return undefined as T;
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && options.auth !== false && !options.token) onUnauthorized?.();
    const error = toApiError(response.status, body);
    if (error.code === "workspace_not_found" && !options.token) {
      // The selected workspace was deleted or we were removed: fall back to the default.
      const active = accountStore.getActive();
      if (active && workspaceStore.get(active.user.id) != null) workspaceStore.set(active.user.id, null);
    }
    throw error;
  }
  return body as T;
}

/**
 * Uploads a file with progress reporting. fetch() cannot report upload progress, so this
 * uses XMLHttpRequest.
 */
export function uploadWithProgress<T>(
  path: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE_URL}${path}`);
    for (const [name, value] of Object.entries(authHeaders())) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onerror = () => reject(new ApiError(0, "Cannot reach the server.", "network"));
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else {
        if (xhr.status === 401) onUnauthorized?.();
        reject(toApiError(xhr.status, body));
      }
    };
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}
