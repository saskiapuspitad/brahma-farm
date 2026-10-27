"use client";

/** Wrapper fetch untuk API BrahmaFarm dengan amplop respons konsisten. */
export interface ApiResult<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; details?: { field: string; message: string }[] };
}

export async function api<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    const json = await res.json();
    if (json.success) return { ok: true, data: json.data as T };
    return { ok: false, error: json.error };
  } catch {
    return { ok: false, error: { code: "NETWORK", message: "Tidak dapat terhubung ke server" } };
  }
}

export const apiGet = <T>(path: string) => api<T>(path);
export const apiPost = <T>(path: string, body: unknown) => api<T>(path, { method: "POST", body: JSON.stringify(body) });
export const apiPatch = <T>(path: string, body: unknown) => api<T>(path, { method: "PATCH", body: JSON.stringify(body) });
export const apiDelete = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: "DELETE", ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
