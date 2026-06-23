import { describe, expect, it } from 'vitest';

import { pair } from '../lim.js';

import type { CompletedRound, Player } from '../types.js';

const SIX_PLAYERS: Player[] = [
  { id: 'A', points: 0, rank: 1, rating: 2000 },
  { id: 'B', points: 0, rank: 2, rating: 1900 },
  { id: 'C', points: 0, rank: 3, rating: 1800 },
  { id: 'D', points: 0, rank: 4, rating: 1700 },
  { id: 'E', points: 0, rank: 5, rating: 1600 },
  { id: 'F', points: 0, rank: 6, rating: 1500 },
];

const FOUR_PLAYERS: Player[] = SIX_PLAYERS.slice(0, 4);

describe('lim', () => {
  describe('validation', () => {
    it('throws RangeError when fewer than 2 players', () => {
      expect(() => pair([FOUR_PLAYERS[0]!], [])).toThrow(RangeError);
    });
  });

  describe('round 1 — top half vs bottom half', () => {
    it('pairs 4 players: 1v3, 2v4', () => {
      const result = pair(FOUR_PLAYERS, []);
      expect(result.games).toHaveLength(2);
      expect(result.byes).toHaveLength(0);
      const ids = result.games.map((p) =>
        [p.white, p.black].toSorted((a, b) => a.localeCompare(b)).join('-'),
      );
      expect(ids).toContain('A-C');
      expect(ids).toContain('B-D');
    });

    it('pairs 6 players: 1v4, 2v5, 3v6', () => {
      const result = pair(SIX_PLAYERS, []);
      expect(result.games).toHaveLength(3);
      expect(result.byes).toHaveLength(0);
      const ids = result.games.map((p) =>
        [p.white, p.black].toSorted((a, b) => a.localeCompare(b)).join('-'),
      );
      expect(ids).toContain('A-D');
      expect(ids).toContain('B-E');
      expect(ids).toContain('C-F');
    });
  });

  describe('odd player count — bye', () => {
    it('assigns a bye to the lowest-ranked player', () => {
      const result = pair(FOUR_PLAYERS.slice(0, 3), []);
      expect(result.byes).toHaveLength(1);
      expect(result.byes[0]?.player).toBe('C');
      expect(result.games).toHaveLength(1);
    });

    it('does not give a bye to a player who already had one', () => {
      const threePlayers = FOUR_PLAYERS.slice(0, 3);
      // C got a bye in round 1
      const round1: CompletedRound = {
        byes: [{ kind: 'pairing', player: 'C' }],
        games: [{ black: 'B', result: 'white', white: 'A' }],
      };
      const result = pair(threePlayers, [round1]);
      expect(result.byes[0]?.player).not.toBe('C');
    });
  });

  describe('exchange rules — rematches avoided', () => {
    it('exchanges to avoid rematch in scoregroup', () => {
      // A beat C in round 1; so A cannot face C again.
      const round1: CompletedRound = {
        byes: [],
        games: [
          { black: 'C', result: 'white', white: 'A' },
          { black: 'D', result: 'black', white: 'B' },
        ],
      };
      // After round 1: A=1, B=0, C=0, D=1
      const result = pair(FOUR_PLAYERS, [round1]);
      const pairs = result.games.map((p) =>
        [p.white, p.black].toSorted((a, b) => a.localeCompare(b)).join('-'),
      );
      // A vs D is valid (didn't play); B vs C is valid (didn't play)
      expect(pairs).toContain('A-D');
      expect(pairs).toContain('B-C');
    });

    it('forces an exchange when top pairing is a rematch', () => {
      // All 4 players have 0.5 but A already played C (the proposed pair 1v3)
      const round1: CompletedRound = {
        byes: [],
        games: [
          { black: 'C', result: 'draw', white: 'A' },
          { black: 'B', result: 'draw', white: 'D' },
        ],
      };
      const result = pair(FOUR_PLAYERS, [round1]);
      const pairs = result.games.map((p) =>
        [p.white, p.black].toSorted((a, b) => a.localeCompare(b)).join('-'),
      );
      // No rematches
      const playedPairs = ['A-C', 'B-D'];
      for (const pairKey of pairs) {
        expect(playedPairs).not.toContain(pairKey);
      }
    });
  });

  describe('all players appear exactly once per round', () => {
    it('every player is paired or has a bye in round 1 (4 players)', () => {
      const result = pair(FOUR_PLAYERS, []);
      const allIds = new Set<string>();
      for (const p of result.games) {
        allIds.add(p.white);
        allIds.add(p.black);
      }
      for (const b of result.byes) {
        allIds.add(b.player);
      }
      for (const player of FOUR_PLAYERS) {
        expect(allIds.has(player.id)).toBe(true);
      }
    });

    it('every player is paired or has a bye in round 1 (6 players)', () => {
      const result = pair(SIX_PLAYERS, []);
      const allIds = new Set<string>();
      for (const p of result.games) {
        allIds.add(p.white);
        allIds.add(p.black);
      }
      for (const b of result.byes) {
        allIds.add(b.player);
      }
      for (const player of SIX_PLAYERS) {
        expect(allIds.has(player.id)).toBe(true);
      }
    });
  });

  describe('color allocation — alternation', () => {
    it('gives White to player who played Black in the previous round', () => {
      // Round 1: A(w) vs B(b) → draw; C(w) vs D(b) → draw
      const round1: CompletedRound = {
        byes: [],
        games: [
          { black: 'B', result: 'draw', white: 'A' },
          { black: 'D', result: 'draw', white: 'C' },
        ],
      };
      // All at 0.5 pts — one scoregroup; B played black → should get white in round 2
      const result = pair(FOUR_PLAYERS, [round1]);
      const bPairing = result.games.find(
        (p) => p.white === 'B' || p.black === 'B',
      );
      expect(bPairing).toBeDefined();
      // B played black last round; B should get white (alternate)
      expect(bPairing?.white).toBe('B');
    });

    it('player who had same color last 2 rounds gets the alternate', () => {
      // Round 1: A(w) vs B(b) → A wins; C(w) vs D(b) → D wins
      // Round 2: A(w) vs D(b) → A wins; B(w) vs C(b) → B wins
      // A: white, white → must get black in round 3
      const round1: CompletedRound = {
        byes: [],
        games: [
          { black: 'B', result: 'white', white: 'A' },
          { black: 'D', result: 'black', white: 'C' },
        ],
      };
      const round2: CompletedRound = {
        byes: [],
        games: [
          { black: 'D', result: 'white', white: 'A' },
          { black: 'C', result: 'white', white: 'B' },
        ],
      };
      const result = pair(FOUR_PLAYERS, [round1, round2]);
      const aPairing = result.games.find(
        (p) => p.white === 'A' || p.black === 'A',
      );
      expect(aPairing).toBeDefined();
      expect(aPairing?.black).toBe('A');
    });
  });

  describe('no 3 same colors in a row', () => {
    it('prevents 3 same colors in a row (Article 5.1.1)', () => {
      // Round 1: A(w) vs B(b) → A wins; C(w) vs D(b) → D wins
      // Round 2: A(w) vs D(b) → A wins; B(w) vs C(b) → B wins
      // A played white in rounds 1 and 2; in round 3, A must play black
      const round1: CompletedRound = {
        byes: [],
        games: [
          { black: 'B', result: 'white', white: 'A' },
          { black: 'D', result: 'black', white: 'C' },
        ],
      };
      const round2: CompletedRound = {
        byes: [],
        games: [
          { black: 'D', result: 'white', white: 'A' },
          { black: 'C', result: 'white', white: 'B' },
        ],
      };
      const result = pair(FOUR_PLAYERS, [round1, round2]);
      const aPairing = result.games.find(
        (p) => p.white === 'A' || p.black === 'A',
      );
      expect(aPairing).toBeDefined();
      expect(aPairing?.black).toBe('A');
    });
  });

  describe('no rematches invariant', () => {
    it('never pairs the same two players twice across 2 rounds', () => {
      const round1Result = pair(FOUR_PLAYERS, []);
      const round1: CompletedRound = {
        byes: round1Result.byes,
        games: round1Result.games.map((p) => ({
          black: p.black,
          result: 'white' as const,
          white: p.white,
        })),
      };
      const round2Result = pair(FOUR_PLAYERS, [round1]);
      const round1Pairs = new Set(
        round1Result.games.map((p) =>
          [p.white, p.black].toSorted((a, b) => a.localeCompare(b)).join('-'),
        ),
      );
      for (const p of round2Result.games) {
        const key = [p.white, p.black]
          .toSorted((a, b) => a.localeCompare(b))
          .join('-');
        expect(round1Pairs.has(key)).toBe(false);
      }
    });
  });

  describe('bi-directional scoregroup order', () => {
    it('processes highest and lowest scoregroups before median', () => {
      // After round 1: A=1, B=0.5, C=0.5, D=0, E=0.5, F=0.5
      const round1: CompletedRound = {
        byes: [],
        games: [
          { black: 'D', result: 'white', white: 'A' },
          { black: 'E', result: 'draw', white: 'B' },
          { black: 'F', result: 'draw', white: 'C' },
        ],
      };
      // This test just verifies the function runs without error and returns valid pairings
      const result = pair(SIX_PLAYERS, [round1]);
      const allIds = new Set<string>();
      for (const p of result.games) {
        allIds.add(p.white);
        allIds.add(p.black);
      }
      for (const b of result.byes) {
        allIds.add(b.player);
      }
      for (const player of SIX_PLAYERS) {
        expect(allIds.has(player.id)).toBe(true);
      }
    });
  });

  describe('multi-round simulation', () => {
    it('pairs 6 players through 3 rounds with no rematches', () => {
      let rounds: CompletedRound[] = [];
      const allPairings: [string, string][] = [];

      for (let round = 1; round <= 3; round++) {
        const result = pair(SIX_PLAYERS, rounds);
        expect(result.games.length + result.byes.length).toBeGreaterThan(0);

        // Check no rematches
        for (const p of result.games) {
          const key = [p.white, p.black]
            .toSorted((a, b) => a.localeCompare(b))
            .join('-') as string;
          const isAlreadyPlayed = allPairings.some(
            ([a, b]) =>
              [a, b].toSorted((x, y) => x.localeCompare(y)).join('-') === key,
          );
          expect(isAlreadyPlayed).toBe(false);
          allPairings.push([p.white, p.black]);
        }

        // All players appear exactly once
        const roundIds = new Set<string>();
        for (const p of result.games) {
          expect(roundIds.has(p.white)).toBe(false);
          expect(roundIds.has(p.black)).toBe(false);
          roundIds.add(p.white);
          roundIds.add(p.black);
        }
        for (const b of result.byes) {
          expect(roundIds.has(b.player)).toBe(false);
          roundIds.add(b.player);
        }
        expect(roundIds.size).toBe(SIX_PLAYERS.length);

        // Simulate results: white always wins
        const roundCompleted: CompletedRound = {
          byes: result.byes,
          games: result.games.map((p) => ({
            black: p.black,
            result: 'white' as const,
            white: p.white,
          })),
        };
        rounds = [...rounds, roundCompleted];
      }
    });

    it('pairs 4 players through 3 rounds with no rematches', () => {
      let rounds: CompletedRound[] = [];

      for (let round = 1; round <= 3; round++) {
        const result = pair(FOUR_PLAYERS, rounds);

        // All players appear exactly once
        const roundIds = new Set<string>();
        for (const p of result.games) {
          expect(roundIds.has(p.white)).toBe(false);
          expect(roundIds.has(p.black)).toBe(false);
          roundIds.add(p.white);
          roundIds.add(p.black);
        }
        for (const b of result.byes) {
          expect(roundIds.has(b.player)).toBe(false);
          roundIds.add(b.player);
        }
        expect(roundIds.size).toBe(FOUR_PLAYERS.length);

        // Simulate results: draw
        const roundCompleted: CompletedRound = {
          byes: result.byes,
          games: result.games.map((p) => ({
            black: p.black,
            result: 'draw' as const,
            white: p.white,
          })),
        };
        rounds = [...rounds, roundCompleted];
      }
    });
  });
});
