/**
 * Thin fetch wrapper all pages should use to call the Express API.
 * Vite dev server proxies /api/* to http://localhost:4000 (see vite.config.js).
 *
 * Responses are expected to match the ApiResponse shape documented in
 * shared/types/index.js: { success, data?, error? }.
 *
 * Auth (Person 1 - security fix): the session token is an httpOnly cookie
 * set by the server (see server/src/controllers/auth.controller.js), not a
 * value this file reads or attaches itself - `credentials: "include"` just
 * tells the browser to send/accept that cookie.
 */
const BASE_URL = "/api";

async function request(path, options) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });

  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`Request to ${path} failed (status ${res.status})`);
  }

  if (!json.success) {
    throw new Error(json.error?.message ?? `Request to ${path} failed`);
  }
  return json.data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  delete: (path) => request(path, { method: "DELETE" }),
};
