/**
 * Integration tests for the trace system across blossom and all pairing
 * systems.
 */
import { parse } from '@echecs/trf';
import { describe, expect, it } from 'vitest';

import { maxWeightMatching } from '../blossom.js';
import { pair as bursteinPair } from '../burstein.js';
import { pair as doublePair } from '../double-swiss.js';
import { pair as dubovPair } from '../dubov.js';
import { pair } from '../dutch.js';
import { DynamicUint } from '../dynamic-uint.js';
import { pair as limPair } from '../lim.js';
import { pair as teamPair } from '../swiss-team.js';
import dutchC5 from './fixtures/dutch_2025_C5.trf?raw';

import type { TraceEvent } from '../trace.js';
import type { CompletedRound, Player } from '../types.js';
import type { Tournament } from '@echecs/trf';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function edges(
  ...raw: [number, number, number][]
): [number, number, DynamicUint][] {
  return raw.map(([u, v, w]) => [u, v, DynamicUint.from(w)]);
}

function toSwissPlayers(tournament: Tournament): Player[] {
  return tournament.players.map((p) => ({
    id: String(p.pairingNumber),
    points: 0,
    rank: p.pairingNumber,
    rating: p.rating,
  }));
}

function toSwissRounds(tournament: Tournament): CompletedRound[] {
  let maxRound = 0;
  for (const player of tournament.players) {
    for (const result of player.results) {
      if (result.round > maxRound) {
        maxRound = result.round;
      }
    }
  }

  const roundArrays: CompletedRound[] = Array.from(
    { length: maxRound },
    () => ({ byes: [], games: [] }),
  );

  for (const player of tournament.players) {
    for (const result of player.results) {
      if (result.color !== 'w' || result.opponentId === null) {
        continue;
      }
      let gameResult: 'black' | 'draw' | 'white';
      switch (result.result) {
        case '1':
        case '+': {
          gameResult = 'white';
          break;
        }
        case '0':
        case '-': {
          gameResult = 'black';
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
      const roundIndex = result.round - 1;
      const roundData = roundArrays[roundIndex];
      if (roundData !== undefined) {
        roundData.games.push({
          black: String(result.opponentId),
          result: gameResult,
          white: String(player.pairingNumber),
        });
      }
    }
  }

  return roundArrays;
}

// ---------------------------------------------------------------------------
// Blossom trace tests
// ---------------------------------------------------------------------------

describe('blossom trace', () => {
  it('emits stage-start and complete events', () => {
    const events: TraceEvent[] = [];
    maxWeightMatching(edges([0, 1, 10], [1, 2, 11]), false, (event) =>
      events.push(event),
    );

    const types = events.map((event) => event.type);
    expect(types).toContain('blossom:stage-start');
    expect(types).toContain('blossom:complete');

    const complete = events.find((event) => event.type === 'blossom:complete');
    expect(complete).toBeDefined();
    expect(complete?.type).toBe('blossom:complete');
    expect(
      complete?.type === 'blossom:complete' ? complete.matchedCount : undefined,
    ).toBe(1);
    expect(
      complete?.type === 'blossom:complete' ? complete.vertexCount : undefined,
    ).toBe(3);
  });

  it('emits blossom:formed for an odd cycle', () => {
    const events: TraceEvent[] = [];
    // Triangle with extra vertex — forces blossom formation
    maxWeightMatching(
      edges([0, 1, 10], [1, 2, 10], [2, 0, 10], [0, 3, 1]),
      true,
      (event) => events.push(event),
    );

    expect(events.some((event) => event.type === 'blossom:formed')).toBe(true);
  });

  it('emits no events when no trace callback is provided', () => {
    // Should not throw and should produce correct result
    const result = maxWeightMatching(edges([0, 1, 10], [1, 2, 11]));
    expect(result).toBeDefined();
    expect(result[1]).toBe(2);
    expect(result[2]).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Dutch trace tests
// ---------------------------------------------------------------------------

describe('dutch trace', () => {
  it('emits expected event types for C5 fixture', () => {
    const tournament = parse(dutchC5)!;
    const players = toSwissPlayers(tournament);
    const allRounds = toSwissRounds(tournament);
    const priorRounds = allRounds.slice(0, 2);

    const events: TraceEvent[] = [];
    pair(players, priorRounds, { trace: (event) => events.push(event) });

    const types = new Set(events.map((event) => event.type));

    expect(types.has('pairing:score-groups')).toBe(true);
    expect(types.has('pairing:blossom-invoked')).toBe(true);
    expect(types.has('pairing:blossom-result')).toBe(true);
    expect(types.has('pairing:pair-finalized')).toBe(true);
    expect(types.has('pairing:color-allocated')).toBe(true);
  });

  it('produces the same pairings with and without trace', () => {
    const tournament = parse(dutchC5)!;
    const players = toSwissPlayers(tournament);
    const allRounds = toSwissRounds(tournament);
    const priorRounds = allRounds.slice(0, 2);

    const withoutTrace = pair(players, priorRounds);
    const events: TraceEvent[] = [];
    const withTrace = pair(players, priorRounds, {
      trace: (event) => events.push(event),
    });

    expect(withTrace).toEqual(withoutTrace);
    expect(events.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Smoke tests for all pairing systems
// ---------------------------------------------------------------------------

describe('trace smoke tests', () => {
  const players: Player[] = [
    { id: '1', points: 0, rank: 1, rating: 2000 },
    { id: '2', points: 0, rank: 2, rating: 1900 },
    { id: '3', points: 0, rank: 3, rating: 1800 },
    { id: '4', points: 0, rank: 4, rating: 1700 },
  ];

  it('dubov emits trace events', () => {
    const events: TraceEvent[] = [];
    dubovPair(players, [], { trace: (event) => events.push(event) });
    expect(events.length).toBeGreaterThan(0);
    expect(
      events.some((event) => event.type === 'pairing:blossom-invoked'),
    ).toBe(true);
  });

  it('burstein emits trace events', () => {
    const events: TraceEvent[] = [];
    bursteinPair(players, [], { trace: (event) => events.push(event) });
    expect(events.length).toBeGreaterThan(0);
    expect(
      events.some((event) => event.type === 'pairing:blossom-invoked'),
    ).toBe(true);
  });

  it('lim emits trace events', () => {
    const events: TraceEvent[] = [];
    limPair(players, [], { trace: (event) => events.push(event) });
    expect(events.length).toBeGreaterThan(0);
    expect(
      events.some((event) => event.type === 'pairing:blossom-invoked'),
    ).toBe(true);
  });

  it('double-swiss emits trace events', () => {
    const events: TraceEvent[] = [];
    doublePair(players, [], { trace: (event) => events.push(event) });
    expect(events.length).toBeGreaterThan(0);
  });

  it('swiss-team emits trace events', () => {
    const events: TraceEvent[] = [];
    teamPair(players, [], { trace: (event) => events.push(event) });
    expect(events.length).toBeGreaterThan(0);
  });
});
