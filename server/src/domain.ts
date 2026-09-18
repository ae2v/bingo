import { createHmac, randomInt } from 'node:crypto';

export type BingoCase = { id: string; text: string; category: string; difficulty: number };

export function normalizeName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr');
}

export function generateGrid(cases: BingoCase[], iterations = 5000): BingoCase[] {
  if (cases.length < 16) throw new Error('Il faut au moins 16 cases actives.');
  const target = 2.25;
  let best: BingoCase[] | null = null;
  let bestScore = Infinity;
  for (let run = 0; run < iterations; run++) {
    const candidate = [...cases].sort(() => Math.random() - 0.5).slice(0, 16).sort(() => Math.random() - 0.5);
    const hard = candidate.filter((item) => item.difficulty >= 4);
    if (hard.length < 1 || hard.length > 2 || candidate.filter((item) => item.difficulty === 5).length > 1) continue;
    const categories = new Set(candidate.map((item) => item.category));
    if (categories.size < Math.min(6, new Set(cases.map((item) => item.category)).size)) continue;
    const avg = candidate.reduce((sum, item) => sum + item.difficulty, 0) / 16;
    const categoryMap = candidate.reduce<Record<string, number>>((counts, item) => {
      counts[item.category] = (counts[item.category] ?? 0) + 1;
      return counts;
    }, {});
    const categoryCounts = Object.values(categoryMap);
    const repetition = categoryCounts.reduce((sum, count) => sum + Math.max(0, count - 3) * 3, 0);
    const lines = [...Array(4)].flatMap((_, row) => [
      candidate.slice(row * 4, row * 4 + 4),
      [candidate[row], candidate[row + 4], candidate[row + 8], candidate[row + 12]]
    ]);
    const linePenalty = lines.reduce((sum, line) => sum + Math.abs(line.reduce((a, b) => a + b.difficulty, 0) / 4 - target), 0);
    const duplicatePenalty = lines.reduce((sum, line) => sum + (4 - new Set(line.map((item) => item.category)).size) * 0.8, 0);
    const score = Math.abs(avg - target) * 12 + linePenalty + repetition + duplicatePenalty;
    if (score < bestScore) { best = candidate; bestScore = score; }
  }
  if (!best) {
    return [...cases].sort((a, b) => Math.abs(a.difficulty - 2) - Math.abs(b.difficulty - 2)).slice(0, 16).sort(() => Math.random() - 0.5);
  }
  return best;
}

const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
export function temporaryCode(secret: Buffer, eventId: string, timeMs: number) {
  const slot = Math.floor(timeMs / 600_000);
  const bytes = createHmac('sha256', secret).update(`${eventId}:${slot}`).digest();
  return [...bytes.subarray(0, 4)].map((byte) => alphabet[byte % alphabet.length]).join('');
}

export function completedEntries(positions: number[], max: number) {
  const set = new Set(positions);
  let total = 0;
  for (let row = 0; row < 4; row++) if ([0, 1, 2, 3].every((col) => set.has(row * 4 + col))) total++;
  for (let col = 0; col < 4; col++) if ([0, 1, 2, 3].every((row) => set.has(row * 4 + col))) total++;
  return Math.min(total, max);
}

export function suspicionScore(metrics: { attempts: number; rejected: number; recent: number; scansReceived: number; categoryCount: number }) {
  return Math.min(100,
    metrics.rejected * 12
    + Math.max(0, metrics.recent - 4) * 8
    + Math.max(0, metrics.attempts - 20) * 2
    + Math.max(0, metrics.categoryCount - 3) * 10
    + Math.max(0, metrics.scansReceived - 6) * 3
  );
}

export function drawWeighted<T extends { id: string; entries: number }>(people: T[], count: number) {
  const pool = people.filter((person) => person.entries > 0).map((person) => ({ ...person }));
  const winners: T[] = [];
  while (winners.length < count && pool.length) {
    const total = pool.reduce((sum, person) => sum + person.entries, 0);
    let ticket = randomInt(total);
    const index = pool.findIndex((person) => (ticket -= person.entries) < 0);
    winners.push(pool[index] as T);
    pool.splice(index, 1);
  }
  return winners;
}
