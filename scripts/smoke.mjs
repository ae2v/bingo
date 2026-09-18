import { createHmac } from 'node:crypto';

const base = process.env.SMOKE_URL ?? 'http://127.0.0.1:8787';
const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
const jars = new Map();

async function request(path, { jar = 'default', method = 'GET', body } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(jars.get(jar) ? { cookie: jars.get(jar) } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const cookies = response.headers.getSetCookie?.() ?? [];
  if (cookies.length) jars.set(jar, cookies.map((value) => value.split(';')[0]).join('; '));
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${data.message ?? data.reason ?? ''}`);
  return data;
}

function codeFor(player, time) {
  const slot = Math.floor(time / 600_000);
  const bytes = createHmac('sha256', Buffer.from(player.user.codeSecret, 'base64')).update(`${player.user.eventId}:${slot}`).digest();
  return [...bytes.subarray(0, 4)].map((byte) => alphabet[byte % alphabet.length]).join('');
}

await request('/api/admin/login', { jar: 'admin', method: 'POST', body: { password: process.env.ADMIN_PASSWORD ?? 'exemplemdp' } });
try {
  await request('/api/admin/game/reset', { jar: 'admin', method: 'POST', body: { confirmation: 'RESET BINGO' } });
  for (let index = 0; index < 17; index++) await request('/api/player/register', { jar: `p${index}`, method: 'POST', body: { firstName: `Test${index}`, lastName: 'Smoke' } });
  const players = await Promise.all([...Array(17)].map((_, index) => request('/api/player/me', { jar: `p${index}` })));
  await request('/api/admin/config', { jar: 'admin', method: 'PATCH', body: { raffleWinnerCount: 1, rafflePrizeLabel: 'lot de test', firstFullPrizeLabel: 'grand lot de test', maxRaffleEntries: 3, excludeFirstFromRaffle: false } });
  await request('/api/admin/game/start', { jar: 'admin', method: 'POST', body: {} });
  const owner = players[0];
  for (let index = 0; index < 16; index++) {
    const target = players[index + 1]; const scannedAt = Date.now();
    await request('/api/player/validate', { jar: 'p0', method: 'POST', body: { itemId: owner.grid[index].id, firstName: target.user.firstName, code: codeFor(target, scannedAt), scannedAt, clientId: crypto.randomUUID() } });
  }
  const completed = await request('/api/player/me', { jar: 'p0' });
  if (!completed.isFirstFullWinner || completed.progress.validated !== 16 || completed.progress.entries !== 3) throw new Error('Le premier bingo ou les participations sont incorrects.');
  await request('/api/admin/game/finish', { jar: 'admin', method: 'POST', body: {} });
  const draw = await request('/api/admin/draw', { jar: 'admin', method: 'POST', body: {} });
  const publicState = await request('/api/public/state');
  if (publicState.firstFullWinner !== 'Test0' || draw.winners.length !== 1 || publicState.raffleWinners.length !== 1 || 'lastName' in publicState.raffleWinners[0]) throw new Error('Résultats publics incorrects ou nom de famille exposé.');
  console.log(JSON.stringify({ players: 17, validations: 16, firstWinner: publicState.firstFullWinner, raffleWinner: publicState.raffleWinners[0].firstName }));
} finally {
  await request('/api/admin/game/reset', { jar: 'admin', method: 'POST', body: { confirmation: 'RESET BINGO' } }).catch(() => undefined);
  await request('/api/admin/config', { jar: 'admin', method: 'PATCH', body: { raffleWinnerCount: 3, rafflePrizeLabel: 'une consommation au bar', firstFullPrizeLabel: 'un pull de l’IUT offert par AE2V', maxRaffleEntries: 3, excludeFirstFromRaffle: true } }).catch(() => undefined);
}
