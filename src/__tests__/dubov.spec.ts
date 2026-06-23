import { describe, expect, it } from 'vitest';

import { pair } from '../dubov.js';

import type { CompletedRound, Player } from '../types.js';

const FOUR_PLAYERS: Player[] = [
  { id: 'A', points: 0, rank: 1, rating: 2000 },
  { id: 'B', points: 0, rank: 2, rating: 1900 },
  { id: 'C', points: 0, rank: 3, rating: 1800 },
  { id: 'D', points: 0, rank: 4, rating: 1700 },
];

describe('dubov', () => {
  describe('round 1', () => {
    it('pairs adjacent ranks: 1 vs 2, 3 vs 4', () => {
      const result = pair(FOUR_PLAYERS, []);
      expect(result.games).toHaveLength(2);
      const ids = result.games.map((p) =>
        [p.white, p.black].toSorted((a, b) => a.localeCompare(b)).join('-'),
      );
      expect(ids).toContain('A-B');
      expect(ids).toContain('C-D');
    });

    it('assigns a bye to the lowest-ranked odd player', () => {
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
          { black: 'B', result: 'white', white: 'A' },
          { black: 'D', result: 'white', white: 'C' },
        ],
      };
      const result = pair(FOUR_PLAYERS, [round1]);
      const pairs = result.games.map((p) =>
        [p.white, p.black].toSorted((a, b) => a.localeCompare(b)).join('-'),
      );
      expect(pairs).not.toContain('A-B');
      expect(pairs).not.toContain('C-D');
    });
  });

  describe('validation', () => {
    it('throws RangeError when fewer than 2 players', () => {
      expect(() => pair([FOUR_PLAYERS[0]!], [])).toThrow(RangeError);
    });
  });
});
