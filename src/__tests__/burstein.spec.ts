import { describe, expect, it } from 'vitest';

import { pair } from '../burstein.js';

import type { CompletedRound, Player } from '../types.js';

const FOUR_PLAYERS: Player[] = [
  { id: 'A', points: 0, rank: 1, rating: 2000 },
  { id: 'B', points: 0, rank: 2, rating: 1900 },
  { id: 'C', points: 0, rank: 3, rating: 1800 },
  { id: 'D', points: 0, rank: 4, rating: 1700 },
];

describe('burstein', () => {
  describe('round 1', () => {
    it('pairs highest vs lowest, second vs third', () => {
      const result = pair(FOUR_PLAYERS, []);
      expect(result.games).toHaveLength(2);
      expect(result.byes).toHaveLength(0);
      const ids = result.games.map((p) =>
        [p.white, p.black].toSorted().join('-'),
      );
      expect(ids).toContain('A-D');
      expect(ids).toContain('B-C');
    });

    it('assigns a bye to the lowest-rated player when odd count', () => {
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
          { black: 'D', result: 'white', white: 'A' },
          { black: 'C', result: 'white', white: 'B' },
        ],
      };
      const result = pair(FOUR_PLAYERS, [round1]);
      const pairs = result.games.map((p) =>
        [p.white, p.black].toSorted().join('-'),
      );
      expect(pairs).not.toContain('A-D');
      expect(pairs).not.toContain('B-C');
    });

    it('does not give a bye to a player who already had one', () => {
      const threePlayers = FOUR_PLAYERS.slice(0, 3);
      // C got a bye in round 1 (bye sentinel via byes array)
      const round1: CompletedRound = {
        byes: [{ kind: 'pairing', player: 'C' }],
        games: [{ black: 'B', result: 'white', white: 'A' }],
      };
      const result = pair(threePlayers, [round1]);
      expect(result.byes[0]?.player).not.toBe('C');
    });
  });

  describe('validation', () => {
    it('throws RangeError when fewer than 2 players', () => {
      expect(() => pair([FOUR_PLAYERS[0]!], [])).toThrow(RangeError);
    });
  });
});
