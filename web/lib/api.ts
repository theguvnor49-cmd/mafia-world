const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const TOKEN_KEY = 'mafia_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

export interface ApiResult<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

/** Thin fetch wrapper: attaches the JWT (if any) and always returns the { ok, data | error } shape. */
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<ApiResult<T>> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(`${API_URL}${path}`, { ...options, headers });
    return (await res.json()) as ApiResult<T>;
  } catch {
    return { ok: false, error: { code: 'NETWORK_ERROR', message: 'Could not reach the server.' } };
  }
}
