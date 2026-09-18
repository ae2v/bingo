import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

describe('api', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('n’envoie pas content-type pour une requête DELETE sans corps', async () => {
    const fetchMock = vi.fn(async (_path: string, options: RequestInit) => {
      expect(new Headers(options.headers).has('content-type')).toBe(false);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    await api('/api/admin/users/example', { method: 'DELETE' });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('ajoute content-type lorsqu’un corps JSON est présent', async () => {
    const fetchMock = vi.fn(async (_path: string, options: RequestInit) => {
      expect(new Headers(options.headers).get('content-type')).toBe('application/json');
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    await api('/api/example', { method: 'POST', body: JSON.stringify({ ok: true }) });
  });
});
