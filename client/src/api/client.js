/**
 * Thin fetch wrapper all pages should use to call the Express API.
 * Vite dev server proxies /api/* to http://localhost:4000 (see vite.config.js).
 *
 * Responses are expected to match the ApiResponse shape documented in
 * shared/types/index.js: { success, data?, error? }.
 */
const BASE_URL = "/api";

async function request(path, options) {
  const token = localStorage.getItem("authToken");
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
  });

  const json = await res.json();
  if (!json.success || json.data === undefined) {
    throw new Error(json.error?.message ?? `Request to ${path} failed`);
  }
  return json.data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  delete: (path) => request(path, { method: "DELETE" }),
};
