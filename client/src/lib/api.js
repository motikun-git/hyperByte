// Talks to the PHP API at /api. Admin changes send the CSRF token, and
// PUT/PATCH/DELETE are sent as POST + X-HTTP-Method-Override because some
// shared hosts block those methods.

let csrfToken = "";
export const setCsrf = (token) => {
  csrfToken = token || "";
};
export const getCsrf = () => csrfToken;

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data || {};
    this.errors = data?.errors || {};
  }
}

export async function api(path, { method = "GET", body, form, signal } = {}) {
  const headers = { Accept: "application/json" };
  const init = { method, headers, credentials: "same-origin", signal };
  if (method !== "GET" && method !== "POST") {
    headers["X-HTTP-Method-Override"] = method;
    init.method = "POST";
  }
  if (csrfToken && method !== "GET") headers["X-CSRF-Token"] = csrfToken;
  if (form) {
    init.body = form;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`/api${path}`, init);
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    throw new ApiError("Could not reach the server. Check your internet connection and try again.", 0);
  }
  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const data = isJson ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    const fallback = res.status === 413 ? "The upload is too large for the server." : `Request failed (${res.status}).`;
    throw new ApiError(data?.message || fallback, res.status, data);
  }
  return data;
}

/** Builds a query string from an object, skipping empty values. */
export function qs(params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "" && v !== false) p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}
