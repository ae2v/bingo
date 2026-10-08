import * as oidc from 'openid-client';
import { sealData, unsealData } from 'iron-session';
import type { FastifyInstance } from 'fastify';
import { config } from './config.js';

export const adminCookie = 'bingo_sso_admin';
const transactionCookie = 'bingo_oidc';
const options = { path: '/', httpOnly: true, sameSite: 'lax' as const, secure: new URL(config.publicOrigin).protocol === 'https:', maxAge: 300 };
export function env(name: string) { const value = process.env[name]; if (!value) throw new Error(`Variable serveur manquante : ${name}`); return value; }
export interface AdminIdentity { id: string; email: string; role: 'admin'; expires: number; issuer: string; clientId: string }
interface Transaction { verifier: string; state: string; nonce: string; expires: number }
let discovery: Promise<oidc.Configuration> | undefined;
function configuration() {
  return discovery ??= oidc.discovery(new URL(env('SSO_ISSUER')), env('SSO_CLIENT_ID'), { client_secret: env('SSO_CLIENT_SECRET'), token_endpoint_auth_method: 'client_secret_basic' }, oidc.ClientSecretBasic(env('SSO_CLIENT_SECRET')), { execute: [oidc.enableNonRepudiationChecks] });
}
export function identityFromClaims(claims: oidc.IDToken | undefined): AdminIdentity {
  if (!claims || claims[env('ROLE_CLAIM_NAMESPACE')] !== 'admin' || typeof claims.email !== 'string' || claims.email_verified !== true || claims.exp <= Date.now()/1000) throw new Error('Accès administrateur refusé.');
  return { id: claims.sub, email: claims.email, role: 'admin', expires: Math.min(claims.exp, Date.now()/1000 + 300), issuer: env('SSO_ISSUER'), clientId: env('SSO_CLIENT_ID') };
}
export async function readAdmin(token?: string): Promise<AdminIdentity | null> {
  if (!token) return null;
  try {
    const user = await unsealData<AdminIdentity>(token, { password: config.cookieSecret, ttl: 300 });
    return user.role === 'admin' && typeof user.id === 'string' && typeof user.email === 'string' && user.expires > Date.now()/1000 && user.issuer === env('SSO_ISSUER') && user.clientId === env('SSO_CLIENT_ID') ? user : null;
  } catch { return null; }
}
export function requireAdminOrigin(origin?: string) {
  if (origin !== new URL(config.publicOrigin).origin) throw Object.assign(new Error('Origine non autorisée.'), { statusCode: 403 });
}
export async function registerSsoRoutes(app: FastifyInstance) {
  app.get('/api/admin/login', { config: { rateLimit: { max: 8, timeWindow: '10 minutes' } } }, async (_request, reply) => {
    const transaction: Transaction = { verifier: oidc.randomPKCECodeVerifier(), state: oidc.randomState(), nonce: oidc.randomNonce(), expires: Date.now() + 300_000 };
    const url = oidc.buildAuthorizationUrl(await configuration(), { redirect_uri: new URL('/api/admin/callback', config.publicOrigin).href, scope: 'openid profile email', code_challenge: await oidc.calculatePKCECodeChallenge(transaction.verifier), code_challenge_method: 'S256', state: transaction.state, nonce: transaction.nonce });
    reply.header('Cache-Control', 'no-store').setCookie(transactionCookie, await sealData(transaction, { password: config.cookieSecret, ttl: 300 }), options);
    return reply.redirect(url.href);
  });
  app.get('/api/admin/callback', async (request, reply) => {
    reply.header('Cache-Control', 'no-store').clearCookie(transactionCookie, { path: '/' });
    try {
      const transaction = await unsealData<Transaction>(request.cookies[transactionCookie] ?? '', { password: config.cookieSecret, ttl: 300 });
      if (!transaction.verifier || !transaction.state || !transaction.nonce || !(transaction.expires > Date.now())) throw new Error('Transaction expirée.');
      const callback = new URL('/api/admin/callback', config.publicOrigin);
      callback.search = new URL(request.raw.url!, config.publicOrigin).search;
      const tokens = await oidc.authorizationCodeGrant(await configuration(), callback, { pkceCodeVerifier: transaction.verifier, expectedState: transaction.state, expectedNonce: transaction.nonce, idTokenExpected: true });
      const user = identityFromClaims(tokens.claims());
      reply.setCookie(adminCookie, await sealData(user, { password: config.cookieSecret, ttl: 300 }), options).clearCookie('bingo_admin', { path: '/' });
      return reply.redirect(new URL('/admin', config.publicOrigin).href);
    } catch {
      reply.clearCookie(adminCookie, { path: '/' });
      return reply.redirect(new URL('/admin?auth=denied', config.publicOrigin).href);
    }
  });
  app.post('/api/admin/logout', async (request, reply) => {
    requireAdminOrigin(request.headers.origin);
    for (const name of [adminCookie, transactionCookie, 'bingo_admin']) reply.clearCookie(name, { path: '/' });
    return { ok: true };
  });
}
