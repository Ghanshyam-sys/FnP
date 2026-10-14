/**
 * The one way the app talks to the backend. Requests go to the same origin (/api), carry the
 * session cookie, and send Django's CSRF token on every change.
 */

export class ApiError extends Error {
  readonly status: number;
  /** The backend's error body: { detail } or a field -> message map. */
  readonly body: Record<string, unknown>;

  constructor(status: number, body: Record<string, unknown>) {
    super(typeof body.detail === "string" ? body.detail : `Request failed (${status})`);
    this.status = status;
    this.body = body;
  }

  /** The message for one field, as the backend validated it. */
  field(name: string): string | undefined {
    const value = this.body[name];
    if (typeof value === "string") return value;
    if (Array.isArray(value) && typeof value[0] === "string") return value[0];
    return undefined;
  }
}

/** Why a change was not saved, in words for the person who made it. */
export function refusalMessage(error: unknown, field: string): string {
  if (error instanceof ApiError) {
    if (error.status === 400) return error.field(field) ?? error.message;
    // Not allowed: the server says why (a reviewer's own application, say).
    if (error.status === 403) return error.message;
    if (error.status === 409) return "The case changed in the meantime and has been refreshed. Cancel, then review it again.";
  }
  return "Not saved. Check your connection and try again.";
}

function csrfToken(): string {
  return document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/)?.[1] ?? "";
}

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/**
 * API responses can be written to the browser console, one collapsed group per call, to see what
 * the backend returned. They hold personal data, so this is on only while developing (npm run dev)
 * or in a build made with VITE_API_LOG=true. In any browser it can be switched for that browser
 * from its console: localStorage.fnpApiLog = "true" (or "false"), then reload.
 */
const API_LOG_ON: boolean = (() => {
  try {
    const choice = localStorage.getItem("fnpApiLog");
    if (choice !== null) return choice === "true";
  } catch {
    // Storage blocked: the build's setting.
  }
  return import.meta.env.DEV || import.meta.env.VITE_API_LOG === "true";
})();

function logResponse(method: Method, path: string, status: number | string, started: number, data?: unknown) {
  if (!API_LOG_ON) return;
  const ok = typeof status === "number" && status < 400;
  const label = `[API] ${method} /api${path} → ${status} (${Math.round(performance.now() - started)} ms)`;
  console.groupCollapsed(`%c${label}`, `color: ${ok ? "#1c7c3a" : "#c0392b"}`);
  if (data !== undefined) console.log(data);
  console.groupEnd();
}

export async function api<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const started = performance.now();
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(method === "GET" ? {} : { "X-CSRFToken": csrfToken() }),
        ...(body === undefined || isForm ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch (error) {
    logResponse(method, path, "network error", started, error);
    throw error;
  }
  if (response.status === 204) {
    logResponse(method, path, 204, started);
    return undefined as T;
  }
  const data = await response.json().catch(() => ({}));
  logResponse(method, path, response.status, started, data);
  if (!response.ok) throw new ApiError(response.status, data as Record<string, unknown>);
  return data as T;
}
