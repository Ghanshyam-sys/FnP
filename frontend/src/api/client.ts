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

export async function api<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(method === "GET" ? {} : { "X-CSRFToken": csrfToken() }),
      ...(body === undefined || isForm ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, data as Record<string, unknown>);
  return data as T;
}
