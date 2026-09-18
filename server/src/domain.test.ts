import { describe, expect, it } from 'vitest';
import { completedEntries, generateGrid, normalizeName, suspicionScore } from './domain.js';

describe('règles métier', () => {
  it('normalise les noms sans perdre les mots', () => expect(normalizeName('  Émilie  Du Pont ')).toBe('emilie du pont'));
  it('plafonne les participations', () => expect(completedEntries([...Array(16).keys()], 3)).toBe(3));
  it('augmente la vigilance quand un QR valide beaucoup de catégories chez les autres', () => {
    expect(suspicionScore({ attempts: 4, rejected: 0, recent: 0, scansReceived: 4, categoryCount: 3 })).toBe(0);
    expect(suspicionScore({ attempts: 8, rejected: 0, recent: 0, scansReceived: 9, categoryCount: 7 })).toBe(49);
  });
  it('génère 16 cases uniques avec 1 ou 2 difficiles', () => {
    const cases = [...Array(40)].map((_, i) => ({ id: String(i), text: `Case ${i}`, category: `C${i % 8}`, difficulty: i % 13 === 0 ? 5 : (i % 11 === 0 ? 4 : (i % 3) + 1) }));
    const grid = generateGrid(cases, 10_000);
    expect(grid).toHaveLength(16);
    expect(new Set(grid.map((item) => item.id)).size).toBe(16);
    expect(grid.filter((item) => item.difficulty >= 4).length).toBeGreaterThanOrEqual(1);
    expect(grid.filter((item) => item.difficulty >= 4).length).toBeLessThanOrEqual(2);
  });
});
