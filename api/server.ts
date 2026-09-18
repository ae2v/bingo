import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildApp } from '../server/src/app.js';

const appPromise = buildApp().then(async (app) => {
  await app.ready();
  return app;
});

export default async function handler(request: VercelRequest, response: VercelResponse) {
  const app = await appPromise;
  const forwardedPath = typeof request.query.__path === 'string' ? request.query.__path : '';
  const search = new URL(request.url ?? '/', 'http://vercel.local').searchParams;
  search.delete('__path');
  const query = search.toString();
  request.url = `/api/${forwardedPath}${query ? `?${query}` : ''}`;
  app.server.emit('request', request, response);
}
