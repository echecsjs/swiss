/**
 * @internal
 * Shared utilities for all FIDE Swiss pairing systems.
 * Provides a precomputed PlayerState struct and related helper functions.
 */
import type { CompletedRound, FloatKind, Game, Player } from './types.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

type Color = 'black' | 'white';

type ColorRule = (
  hrp: PlayerState,
  opponent: PlayerState,
) => 'continue' | 'hrp-black' | 'hrp-white';

interface PlayerState {
  byeCount: number;
  colorDiff: number;
  colorHistory: ('black' | 'white' | undefined)[];
  floatHistory: FloatKind[];
  id: string;
  opponents: Set<string>;
  preferenceStrength: 'absolute' | 'mild' | 'none' | 'strong';
  preferredColor: 'black' | 'white' | undefined;
  score: number;
  tpn: number;
  unplayedRounds: number;
}

// ---------------------------------------------------------------------------
// scoreFor helper
// ---------------------------------------------------------------------------

/**
 * Returns the score earned by `player` in a game.
 * 1 for a win, 0.5 for a draw, 0 for a loss or no-result.
 */
function scoreFor(player: string, game: Game): number {
  if (game.result === 'draw') return 0.5;
  if (game.result === 'none') return 0;
  return (game.result === 'white' && game.white === player) ||
    (game.result === 'black' && game.black === player)
    ? 1
    : 0;
}

// ---------------------------------------------------------------------------
// New precomputed PlayerState API
// ---------------------------------------------------------------------------

/**
 * Builds all PlayerState objects from the player list and game history.
 * All per-player data is computed once and cached.
 */
function buildPlayerStates(
  players: Player[],
  rounds: CompletedRound[],
): PlayerState[] {
  const roundCount = rounds.length;

  // Precompute cumulative score table: cumulativeScore[roundIndex] maps
  // player id → score BEFORE that round.
  const cumulativeScore: Map<string, number>[] = [];
  const runningScoreMap = new Map<string, number>();

  for (const round of rounds) {
    cumulativeScore.push(new Map(runningScoreMap));
    // Byes
    for (const bye of round.byes) {
      // full and pairing byes award 1 point; half-bye awards 0.5; zero-bye awards 0
      const byePoints =
        bye.kind === 'full' || bye.kind === 'pairing'
          ? 1
          : bye.kind === 'half'
            ? 0.5
            : 0;
      runningScoreMap.set(
        bye.player,
        (runningScoreMap.get(bye.player) ?? 0) + byePoints,
      );
    }
    // Games
    for (const game of round.games) {
      runningScoreMap.set(
        game.white,
        (runningScoreMap.get(game.white) ?? 0) + scoreFor(game.white, game),
      );
      runningScoreMap.set(
        game.black,
        (runningScoreMap.get(game.black) ?? 0) + scoreFor(game.black, game),
      );
    }
  }

  return players.map((player, index) => {
    const id = player.id;

    let score = 0;
    const opponents = new Set<string>();
    const colorHistory: ('black' | 'white' | undefined)[] = [];
    let byeCount = 0;
    let unplayedRounds = 0;
    const floatHistory: FloatKind[] = [];

    for (let roundIndex = 0; roundIndex < roundCount; roundIndex++) {
      const round = rounds[roundIndex] as CompletedRound;

      // Check for bye first
      const bye = round.byes.find((b) => b.player === id);
      if (bye !== undefined) {
        // C++ eligibleForBye: player is ineligible when an unplayed match
        // awards >= pointsForWin (1) OR is a pairing bye (participatedInPairing
        // && opponent == self). Half-byes (0.5 pts) and zero-byes (0 pts) do
        // NOT make a player ineligible for future byes.
        const byePoints =
          bye.kind === 'full' || bye.kind === 'pairing'
            ? 1
            : bye.kind === 'half'
              ? 0.5
              : 0;
        if (byePoints >= 1) {
          byeCount++;
        }
        score += byePoints;
        colorHistory.push(undefined);
        // C++ gameWasPlayed is false for all bye types, so byes count as
        // unplayed rounds (same as forfeits). This affects the C9 criterion
        // (minimize unplayed games of bye assignee).
        unplayedRounds++;
        // C++ getFloat: points > pointsForLoss → FLOAT_DOWN, else FLOAT_NONE.
        // pointsForLoss is 0, so only byes awarding > 0 points get downfloat.
        floatHistory.push(byePoints > 0 ? 'down' : undefined);
        continue;
      }

      const game = round.games.find((g) => g.white === id || g.black === id);

      if (game === undefined) {
        colorHistory.push(undefined);
        floatHistory.push(undefined);
        unplayedRounds++;
        continue;
      }

      // Real game
      const isWhite = game.white === id;

      // Forfeit — game was not actually played, no color recorded
      // (matches bbpPairings: gameWasPlayed = false for +/- results)
      const isForfeit = game.forfeit !== undefined;
      colorHistory.push(isForfeit ? undefined : isWhite ? 'white' : 'black');

      const points = scoreFor(id, game);
      score += points;

      // Forfeit — game was not actually played, opponent not recorded
      // (matches bbpPairings: forbiddenPairs only added when gameWasPlayed)
      if (isForfeit) {
        // Forfeit counts as unplayed (C++ playedGames only increments for
        // gameWasPlayed=true; our unplayedRounds is the inverse).
        unplayedRounds++;
        // C++ eligibleForBye returns false when any unplayed match gives
        // points >= pointsForWin. A forfeit win gives 1 point = full win.
        if (points >= 1) {
          byeCount++;
        }
      } else {
        opponents.add(isWhite ? game.black : game.white);
      }

      // Float status
      // Forfeit: bbpPairings treats unplayed games specially —
      // forfeit win (points > loss) = FLOAT_DOWN, otherwise FLOAT_NONE.
      if (isForfeit) {
        // forfeit win: the player who won the forfeit floats down
        // game.forfeit === 'black' means black forfeited, white wins
        // game.forfeit === 'white' means white forfeited, black wins
        const wonForfeit =
          (isWhite && game.forfeit === 'black') ||
          (!isWhite && game.forfeit === 'white');
        floatHistory.push(wonForfeit ? 'down' : undefined);
      } else {
        const opponentId = isWhite ? game.black : game.white;
        const scoresBeforeRound = cumulativeScore[roundIndex];
        const playerScoreBefore = scoresBeforeRound?.get(id) ?? 0;
        const opponentScoreBefore = scoresBeforeRound?.get(opponentId) ?? 0;

        if (playerScoreBefore > opponentScoreBefore) {
          floatHistory.push('down');
        } else if (playerScoreBefore < opponentScoreBefore) {
          floatHistory.push('up');
        } else {
          floatHistory.push(undefined);
        }
      }
    }

    // colorDiff: whites - blacks
    let whites = 0;
    let blacks = 0;
    for (const c of colorHistory) {
      if (c === 'white') whites++;
      else if (c === 'black') blacks++;
    }
    const colorDiff = whites - blacks;

    // preferenceStrength
    const nonUndefinedColors = colorHistory.filter(
      (c): c is 'black' | 'white' => c !== undefined,
    );
    const hasHistory = nonUndefinedColors.length > 0;
    const lastTwo = nonUndefinedColors.slice(-2);

    let preferenceStrength: PlayerState['preferenceStrength'];
    if (!hasHistory) {
      preferenceStrength = 'none';
    } else if (
      Math.abs(colorDiff) > 1 ||
      (lastTwo.length === 2 && lastTwo[0] === lastTwo[1])
    ) {
      preferenceStrength = 'absolute';
    } else if (Math.abs(colorDiff) === 1) {
      preferenceStrength = 'strong';
    } else {
      // colorDiff === 0, has history
      preferenceStrength = 'mild';
    }

    // preferredColor
    let preferredColor: 'black' | 'white' | undefined;
    if (!hasHistory) {
      preferredColor = undefined;
    } else if (colorDiff > 0) {
      // more whites → prefer black
      preferredColor = 'black';
    } else if (colorDiff < 0) {
      // more blacks → prefer white
      preferredColor = 'white';
    } else {
      // colorDiff === 0: prefer opposite of last color played
      const lastColor = nonUndefinedColors.at(-1);
      if (lastColor === 'white') {
        preferredColor = 'black';
      } else if (lastColor === 'black') {
        preferredColor = 'white';
      } else {
        preferredColor = undefined;
      }
    }

    return {
      byeCount,
      colorDiff,
      colorHistory,
      floatHistory,
      id,
      opponents,
      preferenceStrength,
      preferredColor,
      score,
      tpn: index + 1,
      unplayedRounds,
    };
  });
}

/**
 * Returns a Map with keys = scores sorted descending,
 * values = PlayerState arrays sorted by TPN ascending within each group.
 */
function scoreGroups(states: PlayerState[]): Map<number, PlayerState[]> {
  const groups = new Map<number, PlayerState[]>();
  for (const state of states) {
    const group = groups.get(state.score) ?? [];
    group.push(state);
    groups.set(state.score, group);
  }

  // Sort each group by TPN ascending
  // Return map with keys sorted descending; sort groups by TPN ascending
  return new Map(
    [...groups.entries()]
      .toSorted(([a], [b]) => b - a)
      .map(([k, v]) => [k, v.toSorted((a, b) => a.tpn - b.tpn)]),
  );
}

/**
 * Assigns the bye per FIDE basic rules.
 * Returns the selected player state, or undefined if player count is even.
 *
 * 1. If player count is even, return undefined.
 * 2. Filter to players with byeCount === 0 (eligible). If none, use all.
 * 3. Among eligible, find those with the lowest score.
 * 4. If tied, use the tiebreak comparator.
 */
function assignBye(
  states: PlayerState[],
  _rounds: CompletedRound[],
  tiebreak: (a: PlayerState, b: PlayerState) => number,
): PlayerState | undefined {
  if (states.length % 2 === 0) {
    return undefined;
  }

  const eligible = states.filter((s) => s.byeCount === 0);
  const pool = eligible.length > 0 ? eligible : states;

  const minScore = Math.min(...pool.map((s) => s.score));
  const lowestScored = pool.filter((s) => s.score === minScore);

  if (lowestScored.length === 1) {
    return lowestScored[0];
  }

  return lowestScored.toSorted(tiebreak)[0];
}

/**
 * Color allocation engine.
 *
 * Determines the Higher-Ranked Player (HRP): higher score wins; if tied,
 * use rankCompare (negative return = first arg ranks higher).
 * Walks the rules array until one returns a decision.
 * Fallback: HRP gets white.
 */
function allocateColor(
  a: PlayerState,
  b: PlayerState,
  rules: ColorRule[],
  rankCompare: (x: PlayerState, y: PlayerState) => number,
): { black: string; white: string } {
  let hrp: PlayerState;
  let lrp: PlayerState;

  if (a.score > b.score) {
    hrp = a;
    lrp = b;
  } else if (b.score > a.score) {
    hrp = b;
    lrp = a;
  } else {
    const cmp = rankCompare(a, b);
    if (cmp <= 0) {
      hrp = a;
      lrp = b;
    } else {
      hrp = b;
      lrp = a;
    }
  }

  for (const rule of rules) {
    const decision = rule(hrp, lrp);
    if (decision === 'hrp-white') {
      return { black: lrp.id, white: hrp.id };
    }
    if (decision === 'hrp-black') {
      return { black: hrp.id, white: lrp.id };
    }
  }

  // Fallback: HRP gets white
  return { black: lrp.id, white: hrp.id };
}

// ---------------------------------------------------------------------------
// FIDE Article 5.2 — shared colour rules
// ---------------------------------------------------------------------------

/**
 * Maps preference strength to a numeric rank for comparison in rule 5.2.2.
 */
function rankPreference(s: PlayerState['preferenceStrength']): number {
  if (s === 'absolute') return 3;
  if (s === 'strong') return 2;
  if (s === 'mild') return 1;
  return 0;
}

/**
 * Round-1 guard rule for systems whose spec defines Article 5.2.1 as:
 * "When both players have yet to play a game, if the higher ranked player
 * has an odd TPN, give them the initial-colour; otherwise the opposite."
 *
 * Used by Dubov (C.04.4.1) and Burstein (C.04.4.2). Dutch and Lim do not
 * need this — their fallback (5.2.5) handles round 1 implicitly.
 */
const ROUND_1_COLOR_RULE: ColorRule = (hrp, opp) => {
  const hrpHasHistory = hrp.colorHistory.some((c) => c !== undefined);
  const oppHasHistory = opp.colorHistory.some((c) => c !== undefined);
  if (!hrpHasHistory && !oppHasHistory) {
    return hrp.tpn % 2 === 1 ? 'hrp-white' : 'hrp-black';
  }
  return 'continue';
};

/**
 * Common FIDE Article 5.2 colour rules shared by all blossom-based pairing
 * systems (Dutch, Dubov, Burstein, Lim).
 *
 * 5.2.1  Grant both colour preferences (if they differ).
 * 5.2.2  Grant the stronger preference; both absolute → wider colorDiff wins.
 * 5.2.3  Alternate from the most recent round where colours diverged.
 * 5.2.4  Grant the HRP's colour preference.
 * 5.2.5  Odd TPN → initial colour (white).
 *
 * Dubov and Burstein prepend ROUND_1_COLOR_RULE before these rules.
 */
// 5.2.1 Grant both colour preferences
const grantBothPreferences: ColorRule = (hrp, opp) => {
  if (
    hrp.preferredColor !== undefined &&
    opp.preferredColor !== undefined &&
    hrp.preferredColor !== opp.preferredColor
  ) {
    return hrp.preferredColor === 'white' ? 'hrp-white' : 'hrp-black';
  }
  return 'continue';
};

// 5.2.2 Grant stronger preference; both absolute → wider colorDiff wins
const grantStrongerPreference: ColorRule = (hrp, opp) => {
  const hrpS = rankPreference(hrp.preferenceStrength);
  const oppS = rankPreference(opp.preferenceStrength);
  if (hrpS > oppS && hrp.preferredColor !== undefined) {
    return hrp.preferredColor === 'white' ? 'hrp-white' : 'hrp-black';
  }
  if (oppS > hrpS && opp.preferredColor !== undefined) {
    return opp.preferredColor === 'white' ? 'hrp-black' : 'hrp-white';
  }
  if (hrpS === 3 && oppS === 3) {
    const hrpAbs = Math.abs(hrp.colorDiff);
    const oppAbs = Math.abs(opp.colorDiff);
    if (hrpAbs > oppAbs && hrp.preferredColor !== undefined) {
      return hrp.preferredColor === 'white' ? 'hrp-white' : 'hrp-black';
    }
    if (oppAbs > hrpAbs && opp.preferredColor !== undefined) {
      return opp.preferredColor === 'white' ? 'hrp-black' : 'hrp-white';
    }
  }
  return 'continue';
};

// 5.2.3 Alternate from the most recent divergent round
const alternateFromDivergentRound: ColorRule = (hrp, opp) => {
  const minLength = Math.min(hrp.colorHistory.length, opp.colorHistory.length);
  for (let index = minLength - 1; index >= 0; index--) {
    const h = hrp.colorHistory[index];
    const o = opp.colorHistory[index];
    if (h !== undefined && o !== undefined && h !== o) {
      return h === 'white' ? 'hrp-black' : 'hrp-white';
    }
  }
  return 'continue';
};

// 5.2.4 Grant the HRP's preference
const grantHrpPreference: ColorRule = (hrp) => {
  if (hrp.preferredColor !== undefined) {
    return hrp.preferredColor === 'white' ? 'hrp-white' : 'hrp-black';
  }
  return 'continue';
};

// 5.2.5 Odd TPN → initial colour (white)
const tpnFallback: ColorRule = (hrp) =>
  hrp.tpn % 2 === 1 ? 'hrp-white' : 'hrp-black';

const FIDE_COLOR_RULES: ColorRule[] = [
  grantBothPreferences,
  grantStrongerPreference,
  alternateFromDivergentRound,
  grantHrpPreference,
  tpnFallback,
];

// ---------------------------------------------------------------------------
// Legacy API — kept for backward compatibility with modules not yet migrated
// to the PlayerState-based API.
// ---------------------------------------------------------------------------

function gamesForPlayer(player: string, rounds: CompletedRound[]): Game[] {
  return rounds
    .flatMap((r) => r.games)
    .filter((g) => g.white === player || g.black === player);
}

function score(player: string, rounds: CompletedRound[]): number {
  let sum = 0;
  for (const g of gamesForPlayer(player, rounds)) {
    sum += scoreFor(player, g);
  }
  return sum;
}

function byeScore(player: string, rounds: CompletedRound[]): number {
  return rounds.filter((r) => r.byes.some((b) => b.player === player)).length;
}

function colorHistory(player: string, rounds: CompletedRound[]): Color[] {
  const colors: Color[] = [];
  for (const round of rounds) {
    const game = round.games.find(
      (g) => g.white === player || g.black === player,
    );
    if (game === undefined) continue;
    if (game.white === player) {
      colors.push('white');
    } else {
      colors.push('black');
    }
  }
  return colors;
}

/**
 * Returns the color difference: positive means player has played more black
 * than white (prefers white next), negative means the opposite.
 */
function colorPreference(player: string, rounds: CompletedRound[]): number {
  let diff = 0;
  for (const color of colorHistory(player, rounds)) {
    diff += color === 'black' ? 1 : -1;
  }
  return diff;
}

/**
 * Returns score groups for a list of players (legacy, Player-based).
 * Used by lim.ts and lexicographic.ts.
 */
function playerScoreGroups(
  players: Player[],
  rounds: CompletedRound[],
): Map<number, Player[]> {
  const groups = new Map<number, Player[]>();
  for (const player of players) {
    const s = score(player.id, rounds);
    const group = groups.get(s) ?? [];
    group.push(player);
    groups.set(s, group);
  }
  return groups;
}

/**
 * Returns the number of matches (unique rounds with a real opponent) played.
 * Bye rounds are not counted.
 */
function matchCount(player: string, rounds: CompletedRound[]): number {
  let count = 0;
  for (const round of rounds) {
    const hasGame = round.games.some(
      (g) => g.white === player || g.black === player,
    );
    if (hasGame) count++;
  }
  return count;
}

/**
 * Returns an array of colors representing the match-level color history.
 * For each match (unique round with a real opponent), the color is determined
 * by the first game in that round. Bye rounds are excluded.
 */
function matchColorHistory(player: string, rounds: CompletedRound[]): Color[] {
  const colors: Color[] = [];
  for (const round of rounds) {
    const game = round.games.find(
      (g) => g.white === player || g.black === player,
    );
    if (game === undefined) continue;
    colors.push(game.white === player ? 'white' : 'black');
  }
  return colors;
}

/**
 * Returns true if players a and b have faced each other in any previous game.
 */
function hasFaced(a: string, b: string, rounds: CompletedRound[]): boolean {
  return rounds
    .flatMap((r) => r.games)
    .some(
      (g) =>
        (g.white === a && g.black === b) || (g.white === b && g.black === a),
    );
}

/**
 * Assigns colors to a pairing based on each player's color history.
 * The player with a positive color preference (has played more black) gets white.
 */
function assignColors(
  a: Player,
  b: Player,
  rounds: CompletedRound[],
): { black: string; white: string } {
  if (colorPreference(a.id, rounds) > 0) {
    return { black: b.id, white: a.id };
  }
  return { black: a.id, white: b.id };
}

/**
 * Returns players sorted by score descending, then rating descending.
 * This is the standard ranking used by all FIDE Swiss pairing systems.
 */
function rankPlayers(players: Player[], rounds: CompletedRound[]): Player[] {
  return [...players].toSorted((a, b) => {
    const scoreDiff = score(b.id, rounds) - score(a.id, rounds);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    return (b.rating ?? 0) - (a.rating ?? 0);
  });
}

/**
 * Returns the player who should receive a bye this round, or undefined if
 * the player count is even. Prefers the lowest-ranked player who has not
 * already received a bye.
 *
 * @deprecated Use assignBye(states, rounds, tiebreak) instead.
 */
function assignByeLegacy(
  ranked: Player[],
  rounds: CompletedRound[],
): Player | undefined {
  if (ranked.length % 2 === 0) {
    return undefined;
  }
  const eligible = ranked.filter((p) => byeScore(p.id, rounds) === 0);
  return eligible.at(-1) ?? ranked.at(-1);
}

/**
 * Type A color preference for Swiss Team (FIDE C.04.6 Article 1.7.1).
 * Returns 'white' if the team prefers White, 'black' if Black, undefined if no preference.
 */
function typeAColorPreference(
  player: string,
  rounds: CompletedRound[],
): Color | undefined {
  const history = matchColorHistory(player, rounds);
  const whites = history.filter((c) => c === 'white').length;
  const blacks = history.filter((c) => c === 'black').length;
  const cd = whites - blacks; // color difference

  // Preference for White if CD < -1
  if (cd < -1) {
    return 'white';
  }
  // Preference for Black if CD > +1
  if (cd > 1) {
    return 'black';
  }

  const lastTwo = history.slice(-2);
  if (lastTwo.length === 2) {
    // CD is 0 or -1 and last two were Black → preference for White
    if ((cd === 0 || cd === -1) && lastTwo.every((c) => c === 'black')) {
      return 'white';
    }
    // CD is 0 or +1 and last two were White → preference for Black
    if ((cd === 0 || cd === 1) && lastTwo.every((c) => c === 'white')) {
      return 'black';
    }
  }

  return undefined;
}

/**
 * Returns true when playerScore > totalRounds / 2 (FIDE C.04.3 Article 1.8).
 */
function isTopscorer(playerScore: number, totalRounds: number): boolean {
  return playerScore > totalRounds / 2;
}

/**
 * Returns count of rounds where player had no game at all (not even a bye).
 * A bye counts as played.
 */
function unplayedRounds(player: string, rounds: CompletedRound[]): number {
  let count = 0;
  for (const round of rounds) {
    const hasBye = round.byes.some((b) => b.player === player);
    const hasGame = round.games.some(
      (g) => g.white === player || g.black === player,
    );
    if (!hasBye && !hasGame) {
      count++;
    }
  }
  return count;
}

/**
 * Returns per-round float status for a player.
 * 'down' = player floated down (higher score or received bye),
 * 'up' = player floated up (lower score),
 * undefined = equal scores or no game that round.
 */
function floatHistory(player: string, rounds: CompletedRound[]): FloatKind[] {
  const result: FloatKind[] = [];
  for (const [roundIndex, round] of rounds.entries()) {
    // Check for bye
    const bye = round.byes.find((b) => b.player === player);
    if (bye !== undefined) {
      result.push('down');
      continue;
    }

    const game = round.games.find(
      (g) => g.white === player || g.black === player,
    );

    if (game === undefined) {
      result.push(undefined);
      continue;
    }

    const opponent = game.white === player ? game.black : game.white;
    const previousRounds = rounds.slice(0, roundIndex);
    const playerScore = score(player, previousRounds);
    const opponentScore = score(opponent, previousRounds);

    if (playerScore > opponentScore) {
      result.push('down');
    } else if (playerScore < opponentScore) {
      result.push('up');
    } else {
      result.push(undefined);
    }
  }
  return result;
}

export {
  allocateColor,
  assignBye,
  assignByeLegacy,
  assignColors,
  buildPlayerStates,
  byeScore,
  colorHistory,
  colorPreference,
  FIDE_COLOR_RULES,
  floatHistory,
  gamesForPlayer,
  hasFaced,
  isTopscorer,
  matchColorHistory,
  matchCount,
  playerScoreGroups,
  rankPlayers,
  ROUND_1_COLOR_RULE,
  score,
  scoreGroups,
  typeAColorPreference,
  unplayedRounds,
};

export type { Color, ColorRule, PlayerState };
