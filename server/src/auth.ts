import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { config } from './config.js';
import { pool } from './db.js';

export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');

export function passwordMatches(input: string) {
  const a = createHash('sha256').update(input).digest();
  const b = createHash('sha256').update(config.adminPassword).digest();
  return timingSafeEqual(a, b);
}

export async function requireAdmin(request: FastifyRequest) {
  const token = request.cookies.bingo_admin;
  if (!token) throw Object.assign(new Error('Authentification administrateur requise.'), { statusCode: 401 });
  const result = await pool.query(`SELECT 1 FROM admin_sessions WHERE token_hash=$1 AND expires_at>now()`, [tokenHash(token)]);
  if (!result.rowCount) throw Object.assign(new Error('Session administrateur expirée.'), { statusCode: 401 });
}

export async function requirePlayer(request: FastifyRequest) {
  const token = request.cookies.bingo_session;
  if (!token) throw Object.assign(new Error('Inscription requise.'), { statusCode: 401 });
  const result = await pool.query(`SELECT u.* FROM users u WHERE u.device_token_hash=$1`, [tokenHash(token)]);
  if (!result.rowCount) throw Object.assign(new Error('Accès joueur expiré.'), { statusCode: 401 });
  return result.rows[0];
}
