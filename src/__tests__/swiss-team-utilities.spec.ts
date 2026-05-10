import { describe, expect, it } from 'vitest';

import { typeAColorPreference } from '../utilities.js';

import type { CompletedRound } from '../types.js';

describe('typeAColorPreference', () => {
  it('returns undefined when no games played', () => {
    expect(typeAColorPreference('A', [])).toBeUndefined();
  });

  it("returns 'white' when CD < -1 (0 whites, 3 blacks → CD = -3)", () => {
    // 3 black games → whites=0, blacks=3, CD = 0-3 = -3
    const rounds: CompletedRound[] = [
      { byes: [], games: [{ black: 'A', result: 'black', white: 'B' }] },
      { byes: [], games: [{ black: 'A', result: 'white', white: 'B' }] },
      { byes: [], games: [{ black: 'A', result: 'draw', white: 'B' }] },
    ];
    expect(typeAColorPreference('A', rounds)).toBe('white');
  });

  it("returns 'white' when CD is 0 and last two matches were black", () => {
    // History: white, black, black, white, black, black → whites=3, blacks=3, CD=0, last two=black,black
    const rounds: CompletedRound[] = [
      { byes: [], games: [{ black: 'B', result: 'white', white: 'A' }] },
      { byes: [], games: [{ black: 'A', result: 'black', white: 'B' }] },
      { byes: [], games: [{ black: 'A', result: 'black', white: 'B' }] },
      { byes: [], games: [{ black: 'B', result: 'white', white: 'A' }] },
      { byes: [], games: [{ black: 'A', result: 'black', white: 'B' }] },
      { byes: [], games: [{ black: 'A', result: 'black', white: 'B' }] },
    ];
    expect(typeAColorPreference('A', rounds)).toBe('white');
  });

  it("returns 'white' when CD is -1 and last two matches were black", () => {
    // whites=1, blacks=2, CD=-1, last two=black,black
    const rounds: CompletedRound[] = [
      { byes: [], games: [{ black: 'B', result: 'white', white: 'A' }] },
      { byes: [], games: [{ black: 'A', result: 'black', white: 'B' }] },
      { byes: [], games: [{ black: 'A', result: 'black', white: 'B' }] },
    ];
    expect(typeAColorPreference('A', rounds)).toBe('white');
  });

  it("returns 'black' when CD > +1 (3 whites, 0 blacks → CD = +3)", () => {
    // 3 white games → whites=3, blacks=0, CD = 3-0 = 3
    const rounds: CompletedRound[] = [
      { byes: [], games: [{ black: 'B', result: 'white', white: 'A' }] },
      { byes: [], games: [{ black: 'B', result: 'black', white: 'A' }] },
      { byes: [], games: [{ black: 'B', result: 'draw', white: 'A' }] },
    ];
    expect(typeAColorPreference('A', rounds)).toBe('black');
  });

  it("returns 'black' when CD is 0 and last two matches were white", () => {
    // whites=3, blacks=3, last two=white,white
    const rounds: CompletedRound[] = [
      { byes: [], games: [{ black: 'A', result: 'black', white: 'B' }] },
      { byes: [], games: [{ black: 'B', result: 'white', white: 'A' }] },
      { byes: [], games: [{ black: 'B', result: 'white', white: 'A' }] },
      { byes: [], games: [{ black: 'A', result: 'black', white: 'B' }] },
      { byes: [], games: [{ black: 'B', result: 'white', white: 'A' }] },
      { byes: [], games: [{ black: 'B', result: 'white', white: 'A' }] },
    ];
    expect(typeAColorPreference('A', rounds)).toBe('black');
  });

  it("returns 'black' when CD is +1 and last two matches were white", () => {
    // whites=2, blacks=1, CD=1, last two=white,white
    const rounds: CompletedRound[] = [
      { byes: [], games: [{ black: 'A', result: 'black', white: 'B' }] },
      { byes: [], games: [{ black: 'B', result: 'white', white: 'A' }] },
      { byes: [], games: [{ black: 'B', result: 'white', white: 'A' }] },
    ];
    expect(typeAColorPreference('A', rounds)).toBe('black');
  });

  it('returns undefined when CD is 0 and last two differ', () => {
    // whites=2, blacks=2, CD=0, last two=[white,black]
    const rounds: CompletedRound[] = [
      { byes: [], games: [{ black: 'B', result: 'white', white: 'A' }] },
      { byes: [], games: [{ black: 'A', result: 'black', white: 'B' }] },
      { byes: [], games: [{ black: 'B', result: 'white', white: 'A' }] },
      { byes: [], games: [{ black: 'A', result: 'black', white: 'B' }] },
    ];
    // history: white, black, white, black → CD=0, last two=[white,black]
    expect(typeAColorPreference('A', rounds)).toBeUndefined();
  });
});
