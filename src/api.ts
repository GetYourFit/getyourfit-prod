import { sessionUnauthorized } from './session';

interface ApiError {
  error?: string;
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
      credentials: 'same-origin',
    });
  } catch {
    throw new Error('We could not connect to GetYourFit. Check your connection and try again.');
  }
  if (!response.ok) {
    if (response.status === 401) sessionUnauthorized();
    const result = await response.json().catch(() => ({})) as ApiError;
    throw new Error(result.error || 'That action did not complete. Try again.');
  }
  return response.json() as Promise<T>;
}
