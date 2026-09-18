import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { registerRoutes } from './routes.js';

export async function buildApp() {
  const app = Fastify({ logger: true, trustProxy: true });

  // Certains navigateurs/proxys conservent application/json sur les requêtes
  // DELETE sans corps. Fastify doit alors accepter le corps vide au lieu de
  // rejeter la requête avant qu'elle atteigne la route.
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
    const text = typeof body === 'string' ? body : body.toString('utf8');
    if (!text.trim()) return done(null, undefined);
    try { done(null, JSON.parse(text)); }
    catch (error) { done(error as Error, undefined); }
  });

  app.addHook('onSend', async (_request, reply) => {
    reply.header('Permissions-Policy', 'camera=(self)');
  });
  await app.register(cookie, { secret: config.cookieSecret });
  await app.register(cors, {
    origin: config.env === 'production'
      ? [config.publicOrigin, /^https:\/\/bingo-ae2v(?:-[a-z0-9-]+)*\.vercel\.app$/]
      : true,
    credentials: true
  });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        imgSrc: ["'self'", 'data:'],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"]
      }
    }
  });
  await app.register(rateLimit, { max: 240, timeWindow: '1 minute' });
  await registerRoutes(app);

  app.setErrorHandler((error, _request, reply) => {
    const message = error instanceof Error ? error.message : 'Requête invalide.';
    const status = (error as { statusCode?: number }).statusCode && (error as { statusCode: number }).statusCode < 500
      ? (error as { statusCode: number }).statusCode
      : 500;
    if (status === 500) app.log.error(error);
    reply.code(status).send({ message: status === 500 ? 'Une erreur interne est survenue.' : message });
  });

  return app;
}
