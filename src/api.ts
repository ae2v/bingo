export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body != null && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, {
    ...options,
    credentials: 'include',
    headers
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.message ?? data.reason ?? 'La requête a échoué.', response.status);
  return data as T;
}
