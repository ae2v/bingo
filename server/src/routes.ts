import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { newToken, passwordMatches, requireAdmin, requirePlayer, tokenHash } from './auth.js';
import { pool, transaction } from './db.js';
import { completedEntries, drawWeighted, generateGrid, normalizeName, suspicionScore, temporaryCode } from './domain.js';

const EVENT = 'integration-2026';
const cookie = { path: '/', httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 7 };
const parse = <T>(schema: z.ZodType<T>, value: unknown) => {
  const result = schema.safeParse(value);
  if (!result.success) throw Object.assign(new Error(result.error.issues[0]?.message ?? 'Données invalides.'), { statusCode: 400 });
  return result.data;
};

async function eventRow(db: { query: (text: string, values?: unknown[]) => Promise<any> } = pool as any) {
  const result = await db.query(`SELECT * FROM events WHERE slug=$1`, [EVENT]);
  if (!result.rowCount) throw Object.assign(new Error('Événement non initialisé.'), { statusCode: 503 });
  return result.rows[0];
}

async function publicState() {
  const event = await eventRow();
  const [full, draw] = await Promise.all([
    event.first_full_winner_id ? pool.query(`SELECT first_name FROM users WHERE id=$1`, [event.first_full_winner_id]) : Promise.resolve({ rows: [] }),
    pool.query(`SELECT u.first_name, rw.position, rd.prize_label FROM raffle_draws rd JOIN raffle_winners rw ON rw.draw_id=rd.id JOIN users u ON u.id=rw.user_id WHERE rd.event_id=$1 AND rd.id=(SELECT id FROM raffle_draws WHERE event_id=$1 ORDER BY created_at DESC LIMIT 1) ORDER BY rw.position`, [event.id])
  ]);
  return {
    name: event.name, date: event.event_date, state: event.state, serverTime: Date.now(),
    prizes: { full: event.first_full_prize_label, raffle: event.raffle_prize_label },
    firstFullWinner: full.rows[0]?.first_name ?? null,
    raffleWinners: draw.rows.map((row) => ({ firstName: row.first_name, position: row.position, prize: row.prize_label }))
  };
}

async function reconcileAdminWinner(db: { query: (text: string, values?: unknown[]) => Promise<any> }, eventId: string, userId: string) {
  const validated = Number((await db.query(`SELECT count(*) FROM grid_items gi JOIN grids g ON g.id=gi.grid_id WHERE g.user_id=$1 AND gi.validated_at IS NOT NULL`, [userId])).rows[0].count);
  if (validated === 16) {
    await db.query(`UPDATE events SET first_full_winner_id=$1,first_full_winner_at=COALESCE(first_full_winner_at,now()),updated_at=now() WHERE id=$2 AND first_full_winner_id IS NULL`, [userId, eventId]);
  } else {
    await db.query(`UPDATE events SET first_full_winner_id=NULL,first_full_winner_at=NULL,updated_at=now() WHERE id=$1 AND first_full_winner_id=$2`, [eventId, userId]);
  }
}

export async function registerRoutes(app: FastifyInstance) {
  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/public/state', publicState);

  app.post('/api/player/register', async (request, reply) => {
    const body = parse(z.object({ firstName: z.string().trim().min(2).max(50), lastName: z.string().trim().min(2).max(80) }), request.body);
    const token = newToken();
    const response = await transaction(async (db) => {
      const event = await eventRow(db);
      if (event.state === 'ENDED') throw Object.assign(new Error('Les inscriptions sont terminées.'), { statusCode: 409 });
      const first = normalizeName(body.firstName); const last = normalizeName(body.lastName);
      try {
        const userResult = await db.query(`INSERT INTO users(event_id,first_name,last_name,first_normalized,last_normalized,device_token_hash,code_secret) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [event.id, body.firstName.trim(), body.lastName.trim(), first, last, tokenHash(token), randomBytes(32)]);
        const user = userResult.rows[0];
        const casesResult = await db.query(`SELECT id::text,text,category,difficulty FROM bingo_cases WHERE active=true`);
        const selected = generateGrid(casesResult.rows);
        const grid = (await db.query(`INSERT INTO grids(event_id,user_id) VALUES($1,$2) RETURNING id`, [event.id, user.id])).rows[0];
        for (let position = 0; position < selected.length; position++) await db.query(`INSERT INTO grid_items(grid_id,position,case_id) VALUES($1,$2,$3)`, [grid.id, position, selected[position].id]);
        await db.query(`INSERT INTO audit_log(event_id,actor_type,actor_id,action) VALUES($1,'player',$2,'PLAYER_REGISTERED')`, [event.id, user.id]);
        return { id: user.id, firstName: user.first_name, lastName: user.last_name };
      } catch (error: any) {
        if (error.code === '23505') throw Object.assign(new Error('Ce participant est déjà inscrit sur un autre appareil. Demande au BDE de réinitialiser ton accès.'), { statusCode: 409 });
        throw error;
      }
    });
    reply.setCookie('bingo_session', token, cookie).code(201);
    return response;
  });

  app.get('/api/player/me', async (request) => {
    const user = await requirePlayer(request);
    const event = await eventRow();
    const items = await pool.query(`SELECT gi.id,gi.position,c.text,c.category,c.difficulty,gi.validated_at,v.first_name AS validator_first_name FROM grids g JOIN grid_items gi ON gi.grid_id=g.id JOIN bingo_cases c ON c.id=gi.case_id LEFT JOIN users v ON v.id=gi.validated_by WHERE g.user_id=$1 ORDER BY gi.position`, [user.id]);
    const positions = items.rows.filter((row) => row.validated_at).map((row) => row.position);
    return {
      user: { id: user.id, eventId: event.id, firstName: user.first_name, lastName: user.last_name, firstNormalized: user.first_normalized, codeSecret: Buffer.from(user.code_secret).toString('base64') },
      state: await publicState(),
      grid: items.rows.map((row) => ({ id: row.id, position: row.position, text: row.text, category: row.category, difficulty: row.difficulty, status: row.validated_at ? 'confirmed' : 'empty', validatorFirstName: row.validator_first_name })),
      progress: { validated: positions.length, entries: completedEntries(positions, event.max_raffle_entries), maxEntries: event.max_raffle_entries },
      isFirstFullWinner: event.first_full_winner_id === user.id
    };
  });

  app.post('/api/player/validate', async (request, reply) => {
    const user = await requirePlayer(request);
    const body = parse(z.object({ itemId: z.string().uuid(), firstName: z.string().trim().min(1).max(50), code: z.string().trim().toLowerCase().length(4), scannedAt: z.number().int(), clientId: z.string().uuid() }), request.body);
    const result = await transaction(async (db) => {
      const replay = await db.query(`SELECT status,reason FROM validation_attempts WHERE owner_id=$1 AND client_id=$2`, [user.id, body.clientId]);
      if (replay.rowCount) return { ok: replay.rows[0].status === 'CONFIRMED', reason: replay.rows[0].reason, replay: true };
      const event = await eventRow(db);
      if (event.state !== 'RUNNING') return { ok: false, reason: 'La partie n’accepte pas de validation actuellement.' };
      if (body.scannedAt > Date.now() + 300_000 || body.scannedAt < new Date(event.started_at).getTime() - 300_000) return { ok: false, reason: 'L’heure de cette validation est invalide.' };
      const item = await db.query(`SELECT gi.* FROM grid_items gi JOIN grids g ON g.id=gi.grid_id WHERE gi.id=$1 AND g.user_id=$2 FOR UPDATE`, [body.itemId, user.id]);
      if (!item.rowCount) return { ok: false, reason: 'Case introuvable.' };
      if (item.rows[0].validated_at) return { ok: false, reason: 'Cette case est déjà validée.' };
      const candidates = await db.query(`SELECT id,code_secret FROM users WHERE event_id=$1 AND first_normalized=$2`, [event.id, normalizeName(body.firstName)]);
      const matches = candidates.rows.filter((candidate) => [-600_000, 0, 600_000].some((offset) => temporaryCode(Buffer.from(candidate.code_secret), event.id, body.scannedAt + offset) === body.code));
      let reason: string | null = null;
      const target = matches.length === 1 ? matches[0] : null;
      if (!target) reason = matches.length > 1 ? 'Code ambigu : réessaie dans quelques minutes.' : 'Prénom ou code incorrect.';
      else if (target.id === user.id) reason = 'Tu ne peux pas valider ta propre grille.';
      else {
        const validationsByPerson = Number((await db.query(`SELECT count(*) FROM grid_items gi JOIN grids g ON g.id=gi.grid_id WHERE g.user_id=$1 AND gi.validated_by=$2`, [user.id, target.id])).rows[0].count);
        if (validationsByPerson >= 5) reason = 'Cette personne a déjà validé 5 cases de ta grille.';
      }
      await db.query(`INSERT INTO validation_attempts(event_id,owner_id,target_id,grid_item_id,client_id,status,reason,scanned_at) VALUES($1,$2,$3,$4,$5,$6,$7,to_timestamp($8/1000.0))`, [event.id, user.id, target?.id ?? null, body.itemId, body.clientId, reason ? 'REJECTED' : 'CONFIRMED', reason, body.scannedAt]);
      if (reason) return { ok: false, reason };
      await db.query(`UPDATE grid_items SET validated_by=$1,validated_at=now() WHERE id=$2`, [target.id, body.itemId]);
      const count = Number((await db.query(`SELECT count(*) FROM grid_items gi JOIN grids g ON g.id=gi.grid_id WHERE g.user_id=$1 AND gi.validated_at IS NOT NULL`, [user.id])).rows[0].count);
      let firstWinner = false;
      if (count === 16) {
        await db.query(`SELECT id FROM events WHERE id=$1 FOR UPDATE`, [event.id]);
        const won = await db.query(`UPDATE events SET first_full_winner_id=$1,first_full_winner_at=now(),updated_at=now() WHERE id=$2 AND first_full_winner_id IS NULL RETURNING id`, [user.id, event.id]);
        firstWinner = Boolean(won.rowCount);
      }
      return { ok: true, firstWinner };
    });
    if (!result.ok) reply.code(422);
    return result;
  });

  app.post('/api/admin/login', { config: { rateLimit: { max: 8, timeWindow: '10 minutes' } } }, async (request, reply) => {
    const { password } = parse(z.object({ password: z.string().min(1).max(200) }), request.body);
    if (!passwordMatches(password)) throw Object.assign(new Error('Mot de passe incorrect.'), { statusCode: 401 });
    const token = newToken();
    await pool.query(`INSERT INTO admin_sessions(token_hash,expires_at) VALUES($1,now()+interval '12 hours')`, [tokenHash(token)]);
    reply.setCookie('bingo_admin', token, cookie);
    return { ok: true };
  });

  app.post('/api/admin/logout', { preHandler: requireAdmin }, async (request, reply) => {
    const token = request.cookies.bingo_admin!;
    await pool.query(`DELETE FROM admin_sessions WHERE token_hash=$1`, [tokenHash(token)]);
    reply.clearCookie('bingo_admin', { path: '/' });
    return { ok: true };
  });

  app.get('/api/admin/state', { preHandler: requireAdmin }, async () => {
    const event = await eventRow();
    const stats = (await pool.query(`SELECT count(DISTINCT u.id)::int AS players,count(gi.validated_at)::int AS validations FROM users u LEFT JOIN grids g ON g.user_id=u.id LEFT JOIN grid_items gi ON gi.grid_id=g.id WHERE u.event_id=$1`, [event.id])).rows[0];
    const suspicionResult = await pool.query(`WITH attempts AS (
      SELECT u.id,u.first_name,u.last_name,count(va.id)::int attempts,
      count(va.id) FILTER(WHERE va.status='REJECTED')::int rejected,
      count(va.id) FILTER(WHERE va.created_at>now()-interval '2 minutes')::int recent
      FROM users u LEFT JOIN validation_attempts va ON va.owner_id=u.id
      WHERE u.event_id=$1 GROUP BY u.id
    ), scan_usage AS (
      SELECT u.id,count(gi.id)::int scans_received,count(DISTINCT c.category)::int category_count
      FROM users u LEFT JOIN grid_items gi ON gi.validated_by=u.id AND gi.validated_at IS NOT NULL
      LEFT JOIN bingo_cases c ON c.id=gi.case_id
      WHERE u.event_id=$1 GROUP BY u.id
    ) SELECT attempts.*,scan_usage.scans_received,scan_usage.category_count FROM attempts JOIN scan_usage USING(id)`, [event.id]);
    const suspicion = suspicionResult.rows.map((row) => ({ ...row, score: suspicionScore({ attempts: row.attempts, rejected: row.rejected, recent: row.recent, scansReceived: row.scans_received, categoryCount: row.category_count }) })).sort((a, b) => b.score - a.score || b.attempts - a.attempts).slice(0, 12);
    const full = event.first_full_winner_id ? (await pool.query(`SELECT first_name,last_name FROM users WHERE id=$1`, [event.first_full_winner_id])).rows[0] : null;
    const lastDraw = await pool.query(`SELECT u.id,u.first_name,u.last_name,rw.position,rw.entries,rd.prize_label FROM raffle_draws rd JOIN raffle_winners rw ON rw.draw_id=rd.id JOIN users u ON u.id=rw.user_id WHERE rd.event_id=$1 AND rd.id=(SELECT id FROM raffle_draws WHERE event_id=$1 ORDER BY created_at DESC LIMIT 1) ORDER BY rw.position`, [event.id]);
    return { event, stats, suspicion, firstFullWinner: full, drawWinners: lastDraw.rows };
  });

  app.get('/api/admin/users', { preHandler: requireAdmin }, async (request) => {
    const { q } = parse(z.object({ q: z.string().trim().max(100).default('') }), request.query);
    const event = await eventRow(); const search = `%${normalizeName(q)}%`;
    const result = await pool.query(`SELECT u.id,u.first_name,u.last_name,u.created_at,
      count(gi.id) FILTER(WHERE gi.validated_at IS NOT NULL)::int validations,
      count(gi.id) FILTER(WHERE gi.validated_at IS NOT NULL AND gi.validated_by IS NOT NULL)::int scans_made,
      (SELECT count(*)::int FROM grid_items used WHERE used.validated_by=u.id AND used.validated_at IS NOT NULL) scans_received
      FROM users u LEFT JOIN grids g ON g.user_id=u.id LEFT JOIN grid_items gi ON gi.grid_id=g.id
      WHERE u.event_id=$1 AND ($2='%%' OR u.first_normalized LIKE $2 OR u.last_normalized LIKE $2 OR concat(u.first_normalized,' ',u.last_normalized) LIKE $2)
      GROUP BY u.id ORDER BY u.created_at DESC LIMIT 100`, [event.id, search]);
    return result.rows;
  });

  app.get('/api/admin/users/:id', { preHandler: requireAdmin }, async (request) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const event = await eventRow();
    const userResult = await pool.query(`WITH metrics AS (
      SELECT u.id,u.first_name,u.last_name,u.created_at,count(va.id)::int attempts,
      count(va.id) FILTER(WHERE va.status='REJECTED')::int rejected,
      count(va.id) FILTER(WHERE va.created_at>now()-interval '2 minutes')::int recent
      FROM users u LEFT JOIN validation_attempts va ON va.owner_id=u.id
      WHERE u.id=$1 AND u.event_id=$2 GROUP BY u.id
    ), scan_usage AS (
      SELECT count(gi.id)::int scans_received,count(DISTINCT c.category)::int category_count
      FROM grid_items gi JOIN bingo_cases c ON c.id=gi.case_id
      WHERE gi.validated_by=$1 AND gi.validated_at IS NOT NULL
    ) SELECT metrics.*,scan_usage.scans_received,scan_usage.category_count FROM metrics CROSS JOIN scan_usage`, [id, event.id]);
    if (!userResult.rowCount) throw Object.assign(new Error('Participant introuvable.'), { statusCode: 404 });
    const [grid, scans, categories, peopleScanned] = await Promise.all([
      pool.query(`SELECT gi.id,gi.position,gi.validated_at,gi.admin_validated,c.text,c.category,c.difficulty,v.id validator_id,v.first_name validator_first_name,v.last_name validator_last_name FROM grids g JOIN grid_items gi ON gi.grid_id=g.id JOIN bingo_cases c ON c.id=gi.case_id LEFT JOIN users v ON v.id=gi.validated_by WHERE g.user_id=$1 ORDER BY gi.position`, [id]),
      pool.query(`SELECT gi.id item_id,gi.validated_at,c.category,c.text case_text,o.id owner_id,o.first_name owner_first_name,o.last_name owner_last_name FROM grid_items gi JOIN grids g ON g.id=gi.grid_id JOIN users o ON o.id=g.user_id JOIN bingo_cases c ON c.id=gi.case_id WHERE gi.validated_by=$1 ORDER BY gi.validated_at DESC`, [id]),
      pool.query(`SELECT c.category,count(*)::int validations FROM grid_items gi JOIN bingo_cases c ON c.id=gi.case_id WHERE gi.validated_by=$1 GROUP BY c.category ORDER BY validations DESC,c.category`, [id]),
      pool.query(`SELECT gi.id item_id,gi.validated_at,c.category,c.text case_text,v.id person_id,v.first_name person_first_name,v.last_name person_last_name FROM grids g JOIN grid_items gi ON gi.grid_id=g.id JOIN bingo_cases c ON c.id=gi.case_id JOIN users v ON v.id=gi.validated_by WHERE g.user_id=$1 AND gi.validated_at IS NOT NULL ORDER BY gi.validated_at DESC`, [id])
    ]);
    const positions = grid.rows.filter((row) => row.validated_at).map((row) => row.position);
    const user = userResult.rows[0];
    user.score = suspicionScore({ attempts: user.attempts, rejected: user.rejected, recent: user.recent, scansReceived: user.scans_received, categoryCount: user.category_count });
    return { user, grid: grid.rows, scans: scans.rows, peopleScanned: peopleScanned.rows, categories: categories.rows, progress: { validated: positions.length, entries: completedEntries(positions, event.max_raffle_entries), maxEntries: event.max_raffle_entries } };
  });

  app.patch('/api/admin/users/:id/grid/:itemId', { preHandler: requireAdmin }, async (request) => {
    const { id, itemId } = parse(z.object({ id: z.string().uuid(), itemId: z.string().uuid() }), request.params);
    const { validated } = parse(z.object({ validated: z.boolean() }), request.body);
    return transaction(async (db) => {
      const event = await eventRow(db);
      const item = await db.query(`SELECT gi.id FROM grid_items gi JOIN grids g ON g.id=gi.grid_id WHERE gi.id=$1 AND g.user_id=$2 AND g.event_id=$3 FOR UPDATE`, [itemId, id, event.id]);
      if (!item.rowCount) throw Object.assign(new Error('Case introuvable.'), { statusCode: 404 });
      await db.query(validated
        ? `UPDATE grid_items SET validated_by=NULL,admin_validated=true,validated_at=now() WHERE id=$1`
        : `UPDATE grid_items SET validated_by=NULL,admin_validated=false,validated_at=NULL WHERE id=$1`, [itemId]);
      await reconcileAdminWinner(db, event.id, id);
      await db.query(`INSERT INTO audit_log(event_id,actor_type,actor_id,action,details) VALUES($1,'admin',$2,$3,$4)`, [event.id, id, validated ? 'ADMIN_GRID_ITEM_VALIDATED' : 'ADMIN_GRID_ITEM_CANCELLED', JSON.stringify({ itemId })]);
      return { ok: true };
    });
  });

  app.post('/api/admin/users/:id/cancel-validations', { preHandler: requireAdmin }, async (request) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const { category } = parse(z.object({ category: z.string().trim().min(1).max(100).optional() }), request.body ?? {});
    return transaction(async (db) => {
      const event = await eventRow(db);
      const owners = await db.query(`SELECT DISTINCT g.user_id FROM grid_items gi JOIN grids g ON g.id=gi.grid_id JOIN bingo_cases c ON c.id=gi.case_id WHERE gi.validated_by=$1 AND ($2::text IS NULL OR c.category=$2)`, [id, category ?? null]);
      const cleared = await db.query(`UPDATE grid_items gi SET validated_by=NULL,admin_validated=false,validated_at=NULL FROM bingo_cases c WHERE gi.case_id=c.id AND gi.validated_by=$1 AND ($2::text IS NULL OR c.category=$2) RETURNING gi.id`, [id, category ?? null]);
      for (const owner of owners.rows) await reconcileAdminWinner(db, event.id, owner.user_id);
      await db.query(`INSERT INTO audit_log(event_id,actor_type,actor_id,action,details) VALUES($1,'admin',$2,'ADMIN_VALIDATIONS_CANCELLED',$3)`, [event.id, id, JSON.stringify({ category: category ?? null, count: cleared.rowCount })]);
      return { ok: true, count: cleared.rowCount };
    });
  });

  app.delete('/api/admin/users/:id', { preHandler: requireAdmin }, async (request) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    return transaction(async (db) => {
      const event = await eventRow(db);
      const user = await db.query(`SELECT first_name,last_name FROM users WHERE id=$1 AND event_id=$2 FOR UPDATE`, [id, event.id]);
      if (!user.rowCount) throw Object.assign(new Error('Participant introuvable.'), { statusCode: 404 });
      const owners = await db.query(`SELECT DISTINCT g.user_id FROM grid_items gi JOIN grids g ON g.id=gi.grid_id WHERE gi.validated_by=$1`, [id]);
      await db.query(`UPDATE grid_items SET validated_by=NULL,admin_validated=false,validated_at=NULL WHERE validated_by=$1`, [id]);
      await db.query(`DELETE FROM users WHERE id=$1`, [id]);
      for (const owner of owners.rows) if (owner.user_id !== id) await reconcileAdminWinner(db, event.id, owner.user_id);
      await db.query(`INSERT INTO audit_log(event_id,actor_type,actor_id,action,details) VALUES($1,'admin',$2,'ADMIN_USER_DELETED',$3)`, [event.id, id, JSON.stringify({ name: `${user.rows[0].first_name} ${user.rows[0].last_name}` })]);
      return { ok: true };
    });
  });

  app.post('/api/admin/users/:id/reset-device', { preHandler: requireAdmin }, async (request) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    await pool.query(`UPDATE users SET device_token_hash=NULL WHERE id=$1`, [id]);
    return { ok: true };
  });

  app.patch('/api/admin/config', { preHandler: requireAdmin }, async (request) => {
    const body = parse(z.object({ raffleWinnerCount: z.number().int().min(1).max(50), rafflePrizeLabel: z.string().trim().min(2).max(160), firstFullPrizeLabel: z.string().trim().min(2).max(160), maxRaffleEntries: z.number().int().min(1).max(8), excludeFirstFromRaffle: z.boolean() }), request.body);
    const event = await eventRow();
    await pool.query(`UPDATE events SET raffle_winner_count=$1,raffle_prize_label=$2,first_full_prize_label=$3,max_raffle_entries=$4,exclude_first_from_raffle=$5,updated_at=now() WHERE id=$6`, [body.raffleWinnerCount, body.rafflePrizeLabel, body.firstFullPrizeLabel, body.maxRaffleEntries, body.excludeFirstFromRaffle, event.id]);
    return { ok: true };
  });

  app.post('/api/admin/game/:action', { preHandler: requireAdmin }, async (request) => {
    const { action } = parse(z.object({ action: z.enum(['start', 'finish', 'reset']) }), request.params);
    const body = parse(z.object({ confirmation: z.string().optional() }), request.body ?? {});
    return transaction(async (db) => {
      const event = await eventRow(db); await db.query(`SELECT id FROM events WHERE id=$1 FOR UPDATE`, [event.id]);
      if (action === 'start') {
        if (event.state === 'RUNNING') throw Object.assign(new Error('La partie est déjà en cours.'), { statusCode: 409 });
        if (event.state === 'ENDED') await db.query(`DELETE FROM raffle_draws WHERE event_id=$1`, [event.id]);
        await db.query(`UPDATE events SET state='RUNNING',started_at=now(),ended_at=NULL,updated_at=now() WHERE id=$1`, [event.id]);
      }
      if (action === 'finish') {
        if (event.state !== 'RUNNING') throw Object.assign(new Error('La partie n’est pas en cours.'), { statusCode: 409 });
        await db.query(`UPDATE events SET state='ENDED',ended_at=now(),updated_at=now() WHERE id=$1`, [event.id]);
      }
      if (action === 'reset') {
        if (body.confirmation !== 'RESET BINGO') throw Object.assign(new Error('Écris exactement RESET BINGO pour confirmer.'), { statusCode: 400 });
        await db.query(`DELETE FROM users WHERE event_id=$1`, [event.id]);
        await db.query(`UPDATE events SET state='WAITING',first_full_winner_id=NULL,first_full_winner_at=NULL,started_at=NULL,ended_at=NULL,updated_at=now() WHERE id=$1`, [event.id]);
      }
      await db.query(`INSERT INTO audit_log(event_id,actor_type,action,details) VALUES($1,'admin',$2,$3)`, [event.id, `GAME_${action.toUpperCase()}`, JSON.stringify({ confirmation: action === 'reset' })]);
      return { ok: true };
    });
  });

  app.post('/api/admin/draw', { preHandler: requireAdmin }, async () => transaction(async (db) => {
    const event = await eventRow(db); await db.query(`SELECT id FROM events WHERE id=$1 FOR UPDATE`, [event.id]);
    if (event.state === 'WAITING') throw Object.assign(new Error('Démarre la partie avant de lancer le tirage.'), { statusCode: 409 });
    const rows = await db.query(`SELECT u.id,u.first_name,u.last_name,array_remove(array_agg(gi.position) FILTER(WHERE gi.validated_at IS NOT NULL),NULL) positions FROM users u JOIN grids g ON g.user_id=u.id LEFT JOIN grid_items gi ON gi.grid_id=g.id WHERE u.event_id=$1 AND ($2::uuid IS NULL OR NOT $3 OR u.id<>$2) GROUP BY u.id`, [event.id, event.first_full_winner_id, event.exclude_first_from_raffle]);
    const eligible = rows.rows.map((row) => ({ ...row, entries: completedEntries(row.positions ?? [], event.max_raffle_entries) }));
    const winners = drawWeighted(eligible, event.raffle_winner_count);
    if (!winners.length) throw Object.assign(new Error('Aucun participant n’a encore de ligne ou colonne complète.'), { statusCode: 409 });
    if (event.state === 'RUNNING') await db.query(`UPDATE events SET state='ENDED',ended_at=now(),updated_at=now() WHERE id=$1`, [event.id]);
    const draw = (await db.query(`INSERT INTO raffle_draws(event_id,prize_label) VALUES($1,$2) RETURNING id`, [event.id, event.raffle_prize_label])).rows[0];
    for (let i = 0; i < winners.length; i++) await db.query(`INSERT INTO raffle_winners(draw_id,user_id,position,entries) VALUES($1,$2,$3,$4)`, [draw.id, winners[i].id, i + 1, winners[i].entries]);
    await db.query(`INSERT INTO audit_log(event_id,actor_type,action,details) VALUES($1,'admin','RAFFLE_DRAWN',$2)`, [event.id, JSON.stringify({ winners: winners.length, closedGame: event.state === 'RUNNING' })]);
    return { winners: winners.map((winner, index) => ({ ...winner, position: index + 1 })) };
  }));
}
