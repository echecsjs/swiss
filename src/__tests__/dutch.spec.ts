import { describe, expect, it } from 'vitest';

import { pair } from '../dutch.js';

import type { CompletedRound, Player } from '../types.js';

const FOUR_PLAYERS: Player[] = [
  { id: 'A', points: 0, rank: 1, rating: 2000 },
  { id: 'B', points: 0, rank: 2, rating: 1900 },
  { id: 'C', points: 0, rank: 3, rating: 1800 },
  { id: 'D', points: 0, rank: 4, rating: 1700 },
];

describe('dutch', () => {
  describe('round 1', () => {
    it('pairs top half vs bottom half within score group', () => {
      const result = pair(FOUR_PLAYERS, []);
      expect(result.games).toHaveLength(2);
      expect(result.byes).toHaveLength(0);
      // Top half: A, B; Bottom half: C, D
      // Each pairing must cross the boundary
      const topHalf = new Set(['A', 'B']);
      for (const pairing of result.games) {
        expect(topHalf.has(pairing.white) !== topHalf.has(pairing.black)).toBe(
          true,
        );
      }
    });

    it('assigns bye to lowest-rated when odd count', () => {
      const result = pair(FOUR_PLAYERS.slice(0, 3), []);
      expect(result.byes).toHaveLength(1);
      expect(result.byes[0]?.player).toBe('C');
    });
  });

  describe('invariants', () => {
    it('never pairs the same two players twice', () => {
      const round1: CompletedRound = {
        byes: [],
        games: [
          { black: 'C', result: 'white', white: 'A' },
          { black: 'D', result: 'white', white: 'B' },
        ],
      };
      const result = pair(FOUR_PLAYERS, [round1]);
      const pairs = result.games.map((p) =>
        [p.white, p.black].toSorted((a, b) => a.localeCompare(b)).join('-'),
      );
      expect(pairs).not.toContain('A-C');
      expect(pairs).not.toContain('B-D');
    });

    it('produces a complete pairing (all players appear exactly once)', () => {
      const result = pair(FOUR_PLAYERS, []);
      const allIds = result.games.flatMap((p) => [p.white, p.black]);
      expect(new Set(allIds).size).toBe(4);
      expect(allIds).toHaveLength(4);
    });
  });

  describe('validation', () => {
    it('throws RangeError when fewer than 2 players', () => {
      expect(() => pair([FOUR_PLAYERS[0]!], [])).toThrow(RangeError);
    });
  });
});
