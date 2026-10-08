import { createHash, randomBytes } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { adminCookie, readAdmin, requireAdminOrigin } from './sso.js';
import { pool } from './db.js';

export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');

export async function requireAdmin(request: FastifyRequest) {
  const user = await readAdmin(request.cookies[adminCookie]);
  if (!user) throw Object.assign(new Error('Authentification SSO administrateur requise.'), { statusCode: 401 });
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) requireAdminOrigin(request.headers.origin);
}

export async function requirePlayer(request: FastifyRequest) {
  const token = request.cookies.bingo_session;
  if (!token) throw Object.assign(new Error('Inscription requise.'), { statusCode: 401 });
  const result = await pool.query(`SELECT u.* FROM users u WHERE u.device_token_hash=$1`, [tokenHash(token)]);
  if (!result.rowCount) throw Object.assign(new Error('Accès joueur expiré.'), { statusCode: 401 });
  return result.rows[0];
}
