import { z } from 'zod';

export async function wardrobeRequest<T>(path: string, schema: z.ZodType<T>, body?: unknown, method = 'POST'): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/wardrobe${path}`, { method, credentials: 'same-origin',
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  } catch {
    throw new Error('The local service is unavailable. Start it and try again.');
  }
  const payload: unknown = await response.json();
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(payload);
    throw new Error(error.success ? error.data.error : 'This action could not be completed. Try again.');
  }
  return schema.parse(payload);
}
