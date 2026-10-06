interface ApiError {
  error?: string;
}

export type EmailDeliveryMode = 'smtp' | 'local-test' | 'unknown';

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
      credentials: 'same-origin',
    });
  } catch {
    throw new Error('The local service is unavailable. Check that it is running, then try again.');
  }
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as ApiError;
    throw new Error(result.error || 'That action did not complete. Try again.');
  }
  return response.json() as Promise<T>;
}
