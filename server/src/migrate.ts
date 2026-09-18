import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pool } from './db.js';

const sql = await readFile(resolve('server/sql/001_init.sql'), 'utf8');
await pool.query(sql);
console.log('Migration appliquée.');
await pool.end();
