/**
 * FIDE Dutch pairing fixture tests.
 *
 * Test cases sourced from bbpPairings (Apache 2.0):
 * https://github.com/BieremaBoyzProgramming/bbpPairings/tree/main/test/tests
 *
 * Fixture files live in src/__tests__/fixtures/ (copied from @echecs/trf).
 *
 * Tests verify exact FIDE-correct pairings produced by the full C.04.3
 * implementation.
 */
import { parse } from '@echecs/trf';
import { describe, expect, it } from 'vitest';

import { pair } from '../dutch.js';
import dutchC5 from './fixtures/dutch_2025_C5.trf?raw';
import dutchC9 from './fixtures/dutch_2025_C9.trf?raw';
import issue15 from './fixtures/issue_15.trf?raw';
import issue7 from './fixtures/issue_7.trf?raw';

import type { TraceEvent } from '../trace.js';
import type { CompletedRound, Player } from '../types.js';
import type { Tournament } from '@echecs/trf';

// ---------------------------------------------------------------------------
// Adapters — convert @echecs/trf Tournament to @echecs/swiss types
// ---------------------------------------------------------------------------

function toSwissPlayers(tournament: Tournament): Player[] {
  return tournament.players.map((p) => ({
    id: String(p.pairingNumber),
    points: 0,
    rank: p.pairingNumber,
    rating: p.rating,
  }));
}

function toSwissRounds(tournament: Tournament): CompletedRound[] {
  // Find max round
  let maxRound = 0;
  for (const player of tournament.players) {
    for (const result of player.results) {
      if (result.round > maxRound) {
        maxRound = result.round;
      }
    }
  }

  // Build one CompletedRound per round (1-indexed → 0-indexed)
  const roundArrays: CompletedRound[] = Array.from(
    { length: maxRound },
    () => ({ byes: [], games: [] }),
  );

  for (const player of tournament.players) {
    for (const result of player.results) {
      const roundIndex = result.round - 1;
      const roundData = roundArrays[roundIndex];
      if (roundData === undefined) continue;

      // Bye results (no opponent)
      if (result.opponentId === null) {
        const byeKindMap: Record<string, 'full' | 'half' | 'pairing' | 'zero'> =
          {
            F: 'full',
            H: 'half',
            U: 'pairing',
            Z: 'zero',
          };
        const byeKind = byeKindMap[result.result];
        if (byeKind !== undefined) {
          roundData.byes.push({
            kind: byeKind,
            player: String(player.pairingNumber),
          });
        }
        continue;
      }

      // Regular games — only record from white's perspective
      if (result.color !== 'w') continue;

      let gameResult: 'black' | 'draw' | 'white';
      let isForfeitWin = false;
      let isForfeitLoss = false;

      switch (result.result) {
        case '1': {
          gameResult = 'white';
          break;
        }
        case '+': {
          gameResult = 'white';
          isForfeitWin = true;
          break;
        }
        case '0': {
          gameResult = 'black';
          break;
        }
        case '-': {
          gameResult = 'black';
          isForfeitLoss = true;
          break;
        }
        case '=': {
          gameResult = 'draw';
          break;
        }
        default: {
          continue;
        }
      }

      const black = String(result.opponentId);
      const white = String(player.pairingNumber);

      if (isForfeitWin) {
        // white won, black forfeited
        roundData.games.push({
          black,
          forfeit: 'black',
          result: 'white',
          white,
        });
      } else if (isForfeitLoss) {
        // white lost, white forfeited
        roundData.games.push({
          black,
          forfeit: 'white',
          result: 'black',
          white,
        });
      } else {
        roundData.games.push({ black, result: gameResult, white });
      }
    }
  }

  return roundArrays;
}

/** IDs of players who have a pre-assigned Z or F bye in the target round. */
function preAssignedIds(
  tournament: Tournament,
  targetRound: number,
): Set<string> {
  const ids = new Set<string>();
  for (const player of tournament.players) {
    for (const result of player.results) {
      if (
        result.round === targetRound &&
        (result.result === 'Z' || result.result === 'F')
      ) {
        ids.add(String(player.pairingNumber));
      }
    }
  }
  return ids;
}

function isRemainderPhase(phase: string): boolean {
  return phase === 'bracket-remainder' || phase === 'bracket-ordering';
}

// ---------------------------------------------------------------------------
// Fixture loading
// ---------------------------------------------------------------------------

const FIXTURES: Record<string, string> = {
  dutch_2025_C5: dutchC5,
  dutch_2025_C9: dutchC9,
  issue_15: issue15,
  issue_7: issue7,
};

function loadFixture(name: string): Tournament {
  const content = FIXTURES[name];
  if (content === undefined) {
    throw new Error(`Unknown fixture: ${name}`);
  }
  const tournament = parse(content);
  if (tournament === null) {
    throw new Error(`Failed to parse fixture: ${name}`);
  }
  return tournament;
}

// ---------------------------------------------------------------------------
// dutch_2025_C5
// ---------------------------------------------------------------------------
describe('dutch fixture: dutch_2025_C5', () => {
  const tournament = loadFixture('dutch_2025_C5');
  const targetRound = 3;
  const excluded = preAssignedIds(tournament, targetRound);
  const players = toSwissPlayers(tournament).filter((p) => !excluded.has(p.id));
  // rounds up to (not including) round 3 → first 2 rounds
  const allRounds = toSwissRounds(tournament);
  const roundsBefore = allRounds.slice(0, targetRound - 1);

  it('excludes pre-assigned players (P4 has Z-bye)', () => {
    expect(excluded.has('4')).toBe(true);
    expect(players).toHaveLength(5);
  });

  it('produces 2 pairings and 1 bye for round 3 (5 pairable players)', () => {
    const result = pair(players, roundsBefore);
    expect(result.games).toHaveLength(2);
    expect(result.byes).toHaveLength(1);
  });

  it('produces the correct pairings for round 3 (FIDE Dutch C5): 1 vs 5, 3 vs 2, bye to 6', () => {
    const result = pair(players, roundsBefore);
    const pairingSet = new Set(
      result.games.map((p) => [p.white, p.black].toSorted().join('-')),
    );
    expect(pairingSet).toContain('1-5');
    expect(pairingSet).toContain('2-3');
    expect(result.byes).toHaveLength(1);
    expect(result.byes[0]?.player).toBe('6');
  });
});

// ---------------------------------------------------------------------------
// dutch_2025_C9
// ---------------------------------------------------------------------------
describe('dutch fixture: dutch_2025_C9', () => {
  const tournament = loadFixture('dutch_2025_C9');
  const targetRound = 3;
  const excluded = preAssignedIds(tournament, targetRound);
  const players = toSwissPlayers(tournament).filter((p) => !excluded.has(p.id));
  const allRounds = toSwissRounds(tournament);
  const roundsBefore = allRounds.slice(0, targetRound - 1);

  it('has no pre-assigned players for round 3', () => {
    expect(excluded.size).toBe(0);
    expect(players).toHaveLength(5);
  });

  it('produces 2 pairings and 1 bye for round 3 (5 pairable players)', () => {
    const result = pair(players, roundsBefore);
    expect(result.games).toHaveLength(2);
    expect(result.byes).toHaveLength(1);
  });

  it('produces the correct pairings for round 3 (FIDE Dutch C9): 2 vs 1, 3 vs 5, bye to 4', () => {
    const result = pair(players, roundsBefore);
    const pairingSet = new Set(
      result.games.map((p) => [p.white, p.black].toSorted().join('-')),
    );
    expect(pairingSet).toContain('1-2');
    expect(pairingSet).toContain('3-5');
    expect(result.byes).toHaveLength(1);
    expect(result.byes[0]?.player).toBe('4');
  });
});

// ---------------------------------------------------------------------------
// issue_7
// ---------------------------------------------------------------------------
describe('dutch fixture: issue_7', () => {
  const tournament = loadFixture('issue_7');
  const targetRound = 15;
  const excluded = preAssignedIds(tournament, targetRound);
  const players = toSwissPlayers(tournament).filter((p) => !excluded.has(p.id));
  const allRounds = toSwissRounds(tournament);
  const roundsBefore = allRounds.slice(0, targetRound - 1);

  it('produces 30 pairings and no byes for round 15', () => {
    const result = pair(players, roundsBefore);
    expect(result.games).toHaveLength(30);
    expect(result.byes).toHaveLength(0);
  });

  it('produces no rematches in round 15', () => {
    const result = pair(players, roundsBefore);
    // Forfeit games are not considered prior opponents per FIDE/bbpPairings
    const played = roundsBefore
      .flatMap((r) => r.games)
      .filter((g) => g.forfeit === undefined);
    for (const pairing of result.games) {
      const alreadyFaced = played.some(
        (g) =>
          (g.white === pairing.white && g.black === pairing.black) ||
          (g.white === pairing.black && g.black === pairing.white),
      );
      expect(
        alreadyFaced,
        `rematch detected: ${pairing.white} vs ${pairing.black}`,
      ).toBe(false);
    }
  });

  it('does not spin the bracket loop when unmatched players remain', () => {
    const events: TraceEvent[] = [];
    pair(players, roundsBefore, { trace: (event) => events.push(event) });

    const bracketEnters = events.filter(
      (event) => event.type === 'dutch:bracket-enter',
    );
    expect(bracketEnters.length).toBeLessThan(50);
  });

  it('finalizes each remainder pair individually with blossom re-runs', () => {
    const events: TraceEvent[] = [];
    pair(players, roundsBefore, { trace: (event) => events.push(event) });

    const remainderFinalizations = events.filter(
      (event) =>
        event.type === 'pairing:pair-finalized' &&
        isRemainderPhase(event.phase),
    );

    expect(remainderFinalizations.length).toBeGreaterThan(0);

    let blossomCountInRemainder = 0;
    let finalizationCountInRemainder = 0;
    for (const event of events) {
      if (
        event.type === 'pairing:blossom-invoked' &&
        isRemainderPhase(event.phase)
      ) {
        blossomCountInRemainder++;
      }
      if (
        event.type === 'pairing:pair-finalized' &&
        isRemainderPhase(event.phase)
      ) {
        finalizationCountInRemainder++;
      }
    }

    expect(blossomCountInRemainder).toBeGreaterThanOrEqual(
      finalizationCountInRemainder,
    );
  });

  it('produces the exact FIDE-correct pairings for round 15', () => {
    // Reference output from bbpPairings v6.0.0 (--dutch issue_7.trf -p).
    // Each entry is [white, black] as pairing numbers (strings).
    const expected: [string, string][] = [
      ['1', '15'],
      ['3', '2'],
      ['11', '17'],
      ['7', '10'],
      ['8', '14'],
      ['4', '6'],
      ['5', '12'],
      ['9', '16'],
      ['13', '25'],
      ['24', '22'],
      ['18', '29'],
      ['20', '23'],
      ['19', '33'],
      ['21', '38'],
      ['39', '26'],
      ['28', '36'],
      ['31', '40'],
      ['37', '35'],
      ['44', '46'],
      ['30', '32'],
      ['27', '48'],
      ['47', '42'],
      ['51', '55'],
      ['34', '50'],
      ['49', '45'],
      ['53', '58'],
      ['41', '59'],
      ['56', '43'],
      ['60', '52'],
      ['54', '57'],
    ];

    const expectedSet = new Set(
      expected.map(([w, b]) => [w, b].toSorted().join('-')),
    );

    const result = pair(players, roundsBefore);
    const actualSet = new Set(
      result.games.map((p) => [p.white, p.black].toSorted().join('-')),
    );

    expect(actualSet).toEqual(expectedSet);
  });
});

// ---------------------------------------------------------------------------
// issue_15
//
// 180-player tournament, 11 rounds completed. Whole-tournament pairability
// smoke test (bbpPairings issue_15 regression). No expected pairings — just
// verifies pair() can pair all 11 rounds without crashing and produces no
// rematches. XXR=12 means the tournament planned 12 rounds.
// ---------------------------------------------------------------------------
describe('dutch fixture: issue_15', () => {
  const tournament = loadFixture('issue_15');
  const allRounds = toSwissRounds(tournament);

  for (let round = 1; round <= 11; round++) {
    it(
      `pairs round ${round} without crashing (180 players)`,
      { timeout: 120_000 },
      () => {
        // Rounds played before this round
        const roundsBefore = allRounds.slice(0, round - 1);
        const excluded = preAssignedIds(tournament, round);
        const players = toSwissPlayers(tournament).filter(
          (p) => !excluded.has(p.id),
        );
        const result = pair(players, roundsBefore);
        // 180 players, even count → 90 pairings, 0 byes
        expect(result.games).toHaveLength(90);
        expect(result.byes).toHaveLength(0);
      },
    );
  }

  it('produces no rematches in round 11', { timeout: 120_000 }, () => {
    const roundsBefore = allRounds.slice(0, 10);
    const excluded = preAssignedIds(tournament, 11);
    const players = toSwissPlayers(tournament).filter(
      (p) => !excluded.has(p.id),
    );
    const result = pair(players, roundsBefore);
    // Forfeit games are not considered prior opponents per FIDE/bbpPairings
    const played = roundsBefore
      .flatMap((r) => r.games)
      .filter((g) => g.forfeit === undefined);
    for (const pairing of result.games) {
      const alreadyFaced = played.some(
        (g) =>
          (g.white === pairing.white && g.black === pairing.black) ||
          (g.white === pairing.black && g.black === pairing.white),
      );
      expect(
        alreadyFaced,
        `rematch detected: ${pairing.white} vs ${pairing.black}`,
      ).toBe(false);
    }
  });
});
