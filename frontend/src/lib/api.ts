const TOKEN_KEY = "aegis_token";
let token = sessionStorage.getItem(TOKEN_KEY) ?? "";

export function setToken(value: string) {
  token = value;
  if (value) sessionStorage.setItem(TOKEN_KEY, value);
  else sessionStorage.removeItem(TOKEN_KEY);
}
export const hasToken = () => Boolean(token);
export const getToken = () => token;

function headers(body?: BodyInit | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (token) out.Authorization = `Bearer ${token}`;
  if (body && !(body instanceof FormData)) out["Content-Type"] = "application/json";
  return out;
}

const rawBase = (import.meta.env.VITE_API_BASE_URL || "").trim().replace(/\/+$/, "");
export const API_BASE = rawBase.replace(/\/+api$/, "");

function buildApiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const clean = normalized.replace(/^\/+api\//, "/");
  return `${API_BASE}/api${clean}`;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = buildApiUrl(path);
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers: headers(init.body) });
  } catch {
    throw new Error("Cannot reach the server. Check that the backend is running on port 8000.");
  }
  if (response.status === 401 && token) {
    setToken("");
    window.dispatchEvent(new Event("aegis-signed-out"));
  }
  const rawText = await response.text();
  const trimmed = rawText.trim();
  if (trimmed.startsWith("<!doctype") || trimmed.startsWith("<html")) {
    throw new Error(
      "The server returned an HTML page instead of API JSON. If your frontend is hosted separately from your backend, set VITE_API_BASE_URL to your backend URL, or configure an /api/* rewrite."
    );
  }

  if (!response.ok) {
    let message = response.status >= 500
      ? "The server could not handle the request. Check that the backend is running on port 8000."
      : `Request failed (${response.status}).`;
    try {
      const body = JSON.parse(rawText);
      if (typeof body.detail === "string") message = body.detail;
    } catch { /* keep the default message */ }
    throw new Error(message);
  }

  try {
    return JSON.parse(rawText);
  } catch {
    throw new Error("Invalid response format from server.");
  }
}

export const post = <T,>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });

export const patch = <T,>(path: string, body: unknown) =>
  api<T>(path, { method: "PATCH", body: JSON.stringify(body) });

export const put = <T,>(path: string, body: unknown) =>
  api<T>(path, { method: "PUT", body: JSON.stringify(body) });

export const del = <T,>(path: string) =>
  api<T>(path, { method: "DELETE" });

export async function downloadFile(path: string, filename: string): Promise<void> {
  const targetUrl = buildApiUrl(path);
  const response = await fetch(targetUrl, { headers: headers() });
  if (!response.ok) throw new Error("Download failed.");
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

/** Page images need the auth header, so they are fetched and shown as object URLs. */
export async function imageUrl(path: string): Promise<string | null> {
  try {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const response = await fetch(`${API_BASE}/api${normalizedPath}`, { headers: headers() });
    return response.ok ? URL.createObjectURL(await response.blob()) : null;
  } catch {
    return null;
  }
}
