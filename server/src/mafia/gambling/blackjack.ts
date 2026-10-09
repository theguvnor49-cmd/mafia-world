import { GAMBLING } from '../config';

export interface Card {
  rank: '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';
  suit: '♠' | '♥' | '♦' | '♣';
}

export type BlackjackResultKind = 'blackjack' | 'win' | 'lose' | 'push';

export interface BlackjackResult {
  playerCards: Card[];
  dealerCards: Card[];
  playerTotal: number;
  dealerTotal: number;
  result: BlackjackResultKind;
  netChange: number;
}

const RANKS: Card['rank'][] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUITS: Card['suit'][] = ['♠', '♥', '♦', '♣'];

/**
 * Blackjack (brief section 23's "blackjack" candidate) — **auto-played**:
 * the player gets no hit/stand decisions. This is the one real design
 * choice in this file, flagged prominently (also in GAME_DESIGN.md
 * section 23 and "Open questions"): real blackjack is a multi-turn game
 * with player decisions, which would need session state (an in-progress
 * hand surviving across multiple requests) — a fundamentally different
 * shape from every other probabilistic system in this codebase (GTA,
 * busts, hospital's gamble, and this file's own dice/slots/roulette),
 * which all resolve in exactly one request via one pure function. Rather
 * than build a new stateful-session architecture for one game, the
 * player's hand plays itself with the same fixed "stand on 17+, else
 * hit" rule real dealers use — simpler, still genuinely blackjack
 * (naturals, busts, pushes, dealer draws all work exactly as normal), and
 * keeps this game resolvable the same single-request way as the other
 * three. Real hit/stand choice is a candidate for a later pass.
 *
 * Pure, injectable `rng` — shuffles a fresh standard 52-card deck
 * (Fisher-Yates) and deals from it; dealing order (player-player vs.
 * player-dealer-player-dealer) doesn't affect fairness since the whole
 * deck is already a uniformly random permutation before any card is
 * drawn.
 */
export function resolveBlackjack(betAmount: number, rng: () => number = Math.random): BlackjackResult {
  return resolveBlackjackFromDeck(betAmount, buildShuffledDeck(rng));
}

/**
 * Same resolution logic as `resolveBlackjack`, but takes an already-built
 * deck directly instead of shuffling one from an `rng`. Exported
 * specifically so tests can hand-craft an exact draw order (cards are
 * drawn from the end via `.pop()`) without having to reverse-engineer
 * Fisher-Yates output — `resolveBlackjack` above is just this plus a
 * fresh shuffle. Copies the array first so the caller's own deck/array
 * is never mutated.
 */
export function resolveBlackjackFromDeck(betAmount: number, deck: Card[]): BlackjackResult {
  const workingDeck = deck.slice();
  const playerCards = [workingDeck.pop()!, workingDeck.pop()!];
  const dealerCards = [workingDeck.pop()!, workingDeck.pop()!];

  const playerNatural = isNatural(playerCards);
  const dealerNatural = isNatural(dealerCards);

  let finalPlayerCards = playerCards;
  let finalDealerCards = dealerCards;
  let result: BlackjackResultKind;

  if (playerNatural || dealerNatural) {
    result = playerNatural && dealerNatural ? 'push' : playerNatural ? 'blackjack' : 'lose';
  } else {
    finalPlayerCards = playOut(playerCards, workingDeck);
    const playerTotal = handTotal(finalPlayerCards);
    if (playerTotal > 21) {
      result = 'lose'; // player busts — dealer doesn't need to draw, same as a real table
    } else {
      finalDealerCards = playOut(dealerCards, workingDeck);
      const dealerTotal = handTotal(finalDealerCards);
      if (dealerTotal > 21) result = 'win';
      else if (playerTotal > dealerTotal) result = 'win';
      else if (playerTotal < dealerTotal) result = 'lose';
      else result = 'push';
    }
  }

  const netChange =
    result === 'blackjack'
      ? Math.round(betAmount * (GAMBLING.BLACKJACK.BLACKJACK_PAYOUT_MULTIPLIER - 1))
      : result === 'win'
        ? Math.round(betAmount * (GAMBLING.BLACKJACK.WIN_PAYOUT_MULTIPLIER - 1))
        : result === 'push'
          ? 0
          : -betAmount;

  return {
    playerCards: finalPlayerCards,
    dealerCards: finalDealerCards,
    playerTotal: handTotal(finalPlayerCards),
    dealerTotal: handTotal(finalDealerCards),
    result,
    netChange,
  };
}

function buildShuffledDeck(rng: () => number): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function cardValue(rank: Card['rank']): number {
  if (rank === 'A') return 11;
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 10;
  return Number(rank);
}

/** Best total ≤21 if one exists — Aces count as 11 and downgrade to 1,
 * one at a time, for as long as the hand is over 21 and still has an
 * Ace counted high (the standard "soft/hard hand" rule). Exported for
 * direct unit testing of the ace-downgrade logic in isolation. */
export function handTotal(cards: Card[]): number {
  let total = cards.reduce((sum, c) => sum + cardValue(c.rank), 0);
  let highAces = cards.filter((c) => c.rank === 'A').length;
  while (total > 21 && highAces > 0) {
    total -= 10;
    highAces -= 1;
  }
  return total;
}

function isNatural(cards: Card[]): boolean {
  return cards.length === 2 && handTotal(cards) === 21;
}

/** Draws from `deck` until the hand totals 17 or more — the fixed
 * auto-play rule described above, applied identically to the player and
 * the dealer. The `deck.length > 0` guard is a defensive safety net: a
 * single 52-card deck can't realistically be exhausted by one hand, but
 * this keeps the function from ever reading past the end of the deck. */
function playOut(initial: Card[], deck: Card[]): Card[] {
  const cards = initial.slice();
  while (handTotal(cards) < 17 && deck.length > 0) {
    cards.push(deck.pop()!);
  }
  return cards;
}
