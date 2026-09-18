import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pool, transaction } from './db.js';

const parseLine = (line: string) => {
  const last = line.lastIndexOf(',');
  const before = line.slice(0, last);
  const middle = before.lastIndexOf(',');
  return [before.slice(0, middle), before.slice(middle + 1), line.slice(last + 1)] as const;
};

const rows = (await readFile(resolve('data/cases.csv'), 'utf8')).trim().split(/\r?\n/).map(parseLine);
await transaction(async (db) => {
  await db.query(`INSERT INTO events(slug,name,event_date) VALUES('integration-2026','Bingo AE2V — Soirée d’intégration','2026-09-17') ON CONFLICT(slug) DO NOTHING`);
  for (const [text, category, difficulty] of rows) {
    await db.query(`INSERT INTO bingo_cases(text,category,difficulty) VALUES($1,$2,$3) ON CONFLICT(text) DO UPDATE SET category=EXCLUDED.category,difficulty=EXCLUDED.difficulty,active=true`, [text, category, Number(difficulty)]);
  }
});
console.log(`${rows.length} cases et événement AE2V prêts.`);
await pool.end();
