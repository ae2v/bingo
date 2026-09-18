import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import { buildApp } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';

const app = await buildApp();

const webRoot = resolve('dist');
if (existsSync(webRoot)) {
  await app.register(fastifyStatic, { root: webRoot, wildcard: false });
  app.setNotFoundHandler((request, reply) => request.url.startsWith('/api/') ? reply.code(404).send({ message: 'Route introuvable.' }) : reply.sendFile('index.html'));
}

const shutdown = async () => { await app.close(); await pool.end(); process.exit(0); };
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
await app.listen({ port: config.port, host: config.host });
