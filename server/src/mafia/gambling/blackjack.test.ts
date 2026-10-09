import { describe, it, expect } from 'vitest';
import { resolveBlackjack, resolveBlackjackFromDeck, handTotal, type Card } from './blackjack';

// Same verification note as every prior phase's pure logic: this exact
// set of assertions was run and passed as a standalone script (no npm
// deps) while this sandbox couldn't install vitest.

function card(rank: Card['rank'], suit: Card['suit'] = '♠'): Card {
  return { rank, suit };
}

/**
 * Builds a deck for `resolveBlackjackFromDeck` that deals in exactly the
 * given order — `draws[0]` is dealt first, `draws[last]` is dealt last.
 * Cards are drawn via `.pop()` (from the end), so this just reverses the
 * intended draw order into array order.
 */
function deckInDrawOrder(...draws: Card[]): Card[] {
  return draws.slice().reverse();
}

describe('handTotal', () => {
  it('counts face cards as 10 and number cards at face value', () => {
    expect(handTotal([card('K'), card('5')])).toBe(15);
    expect(handTotal([card('Q'), card('J')])).toBe(20);
  });

  it('counts a single Ace as 11 (soft)', () => {
    expect(handTotal([card('A'), card('6')])).toBe(17);
  });

  it('downgrades an Ace to 1 when counting it as 11 would bust', () => {
    expect(handTotal([card('A'), card('9'), card('5')])).toBe(15); // 11+9+5=25 -> 1+9+5=15
  });

  it('downgrades multiple Aces one at a time, only as far as needed', () => {
    // A+A+9: 11+11+9=31 -> downgrade one ace -> 1+11+9=21 (soft 21, not bust)
    expect(handTotal([card('A'), card('A'), card('9')])).toBe(21);
    // A+A+A+9: 11*3+9=42 -> downgrade two aces -> 1+1+11+9=22... still need a third check
    // 11+11+11+9=42; downgrade 1: 1+11+11+9=32; downgrade 2: 1+1+11+9=22; downgrade 3: 1+1+1+9=12
    expect(handTotal([card('A'), card('A'), card('A'), card('9')])).toBe(12);
  });
});

describe('resolveBlackjackFromDeck', () => {
  it('player natural beats a non-natural dealer hand', () => {
    const deck = deckInDrawOrder(card('A', '♠'), card('K', '♥'), card('9', '♦'), card('5', '♣'));
    const result = resolveBlackjackFromDeck(1000, deck);
    expect(result.playerCards).toHaveLength(2);
    expect(result.playerTotal).toBe(21);
    expect(result.result).toBe('blackjack');
    expect(result.netChange).toBe(1500); // 1000 * (2.5 - 1)
  });

  it('dealer natural beats a non-natural player hand', () => {
    const deck = deckInDrawOrder(card('9', '♠'), card('8', '♥'), card('A', '♦'), card('K', '♣'));
    const result = resolveBlackjackFromDeck(1000, deck);
    expect(result.result).toBe('lose');
    expect(result.netChange).toBe(-1000);
  });

  it('both natural is a push (bet returned, no profit or loss)', () => {
    const deck = deckInDrawOrder(card('A', '♠'), card('K', '♥'), card('A', '♦'), card('Q', '♣'));
    const result = resolveBlackjackFromDeck(1000, deck);
    expect(result.result).toBe('push');
    expect(result.netChange).toBe(0);
  });

  it('player busts after hitting on a low hand', () => {
    // Player: 7+8=15 (<17, hits) then draws a King -> 25, bust.
    const deck = deckInDrawOrder(card('7', '♠'), card('8', '♥'), card('9', '♣'), card('4', '♠'), card('K', '♦'));
    const result = resolveBlackjackFromDeck(1000, deck);
    expect(result.playerTotal).toBe(25);
    expect(result.result).toBe('lose');
    expect(result.netChange).toBe(-1000);
    // Dealer never needed to draw — their hand stays exactly as dealt.
    expect(result.dealerCards).toHaveLength(2);
    expect(result.dealerTotal).toBe(13);
  });

  it('dealer busts after player stands pat at 18', () => {
    // Player: K+8=18 (>=17, stands). Dealer: 7+5=12 (<17, hits) draws a
    // King -> 22, bust -> player wins.
    const deck = deckInDrawOrder(card('K', '♠'), card('8', '♥'), card('7', '♦'), card('5', '♣'), card('K', '♥'));
    const result = resolveBlackjackFromDeck(1000, deck);
    expect(result.playerTotal).toBe(18);
    expect(result.dealerTotal).toBe(22);
    expect(result.result).toBe('win');
    expect(result.netChange).toBe(1000); // 1000 * (2 - 1)
  });

  it('plain win: both stand pat, player total higher, no naturals or busts', () => {
    // Player: K+9=19 (stands). Dealer: 7+8=15 (<17, hits) draws a 3 -> 18 (stands, still less than 19).
    const deck = deckInDrawOrder(card('K', '♠'), card('9', '♥'), card('7', '♦'), card('8', '♣'), card('3', '♥'));
    const result = resolveBlackjackFromDeck(1000, deck);
    expect(result.playerTotal).toBe(19);
    expect(result.dealerTotal).toBe(18);
    expect(result.result).toBe('win');
    expect(result.netChange).toBe(1000);
  });

  it('plain push: both stand pat at the same total, no naturals', () => {
    const deck = deckInDrawOrder(card('9', '♠'), card('9', '♥'), card('10', '♦'), card('8', '♣'));
    const result = resolveBlackjackFromDeck(1000, deck);
    expect(result.playerTotal).toBe(18);
    expect(result.dealerTotal).toBe(18);
    expect(result.result).toBe('push');
    expect(result.netChange).toBe(0);
  });

  it('plain loss: both stand pat, dealer total higher', () => {
    const deck = deckInDrawOrder(card('9', '♠'), card('8', '♥'), card('10', '♦'), card('9', '♣'));
    const result = resolveBlackjackFromDeck(1000, deck);
    expect(result.playerTotal).toBe(17);
    expect(result.dealerTotal).toBe(19);
    expect(result.result).toBe('lose');
    expect(result.netChange).toBe(-1000);
  });
});

describe('resolveBlackjack (full shuffle, statistical sanity)', () => {
  it('always returns a valid result kind with internally-consistent netChange, over many trials', () => {
    const trials = 50_000;
    let blackjacks = 0;
    for (let i = 0; i < trials; i++) {
      const result = resolveBlackjack(1000);
      expect(['blackjack', 'win', 'lose', 'push']).toContain(result.result);
      expect(result.playerCards.length).toBeGreaterThanOrEqual(2);
      expect(result.dealerCards.length).toBeGreaterThanOrEqual(2);

      if (result.result === 'blackjack') {
        blackjacks++;
        expect(result.netChange).toBe(1500);
      } else if (result.result === 'win') {
        expect(result.netChange).toBe(1000);
      } else if (result.result === 'push') {
        expect(result.netChange).toBe(0);
      } else {
        expect(result.netChange).toBe(-1000);
      }
    }
    // A single fresh deck's natural-blackjack rate is a known ~4.8% for
    // one hand; two hands sharing one shrinking deck isn't identical but
    // is close. Wide tolerance band — this is a sanity net against
    // naturals being wildly broken (way too common/rare), not a precise
    // statistical claim.
    expect(blackjacks / trials).toBeGreaterThan(0.02);
    expect(blackjacks / trials).toBeLessThan(0.08);
  });

  it('a busted total is always what it actually added up to, past 21, not clamped', () => {
    // Run until we happen to observe a player bust, then sanity-check it
    // directly rather than asserting a bound on how often busts occur.
    let sawBust = false;
    for (let i = 0; i < 20_000 && !sawBust; i++) {
      const result = resolveBlackjack(1000);
      if (result.result === 'lose' && result.playerTotal > 21) {
        sawBust = true;
        expect(result.playerTotal).toBeGreaterThan(21);
        expect(result.playerTotal).toBeLessThan(31); // generously bounded, not infinite
      }
    }
    expect(sawBust).toBe(true);
  });
});
