const TOKEN_KEY = "aegis_token";
let token = sessionStorage.getItem(TOKEN_KEY) ?? "";

export function setToken(value: string) {
  token = value;
  if (value) sessionStorage.setItem(TOKEN_KEY, value);
  else sessionStorage.removeItem(TOKEN_KEY);
}
export const hasToken = () => Boolean(token);

function headers(body?: BodyInit | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (token) out.Authorization = `Bearer ${token}`;
  if (body && !(body instanceof FormData)) out["Content-Type"] = "application/json";
  return out;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api" + path, { ...init, headers: headers(init.body) });
  } catch {
    throw new Error("Cannot reach the server. Check that the backend is running on port 8000.");
  }
  if (response.status === 401 && token) {
    setToken("");
    window.dispatchEvent(new Event("aegis-signed-out"));
  }
  if (!response.ok) {
    let message = response.status >= 500
      ? "The server could not handle the request. Check that the backend is running on port 8000."
      : `Request failed (${response.status}).`;
    try {
      const body = await response.json();
      if (typeof body.detail === "string") message = body.detail;
    } catch { /* keep the default message */ }
    throw new Error(message);
  }
  return response.json();
}

export const post = <T,>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });

/** Page images need the auth header, so they are fetched and shown as object URLs. */
export async function imageUrl(path: string): Promise<string | null> {
  try {
    const response = await fetch("/api" + path, { headers: headers() });
    return response.ok ? URL.createObjectURL(await response.blob()) : null;
  } catch {
    return null;
  }
}
