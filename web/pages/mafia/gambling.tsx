import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/router';
import { apiFetch, getToken } from '../../lib/api';
import NavBar from '../../components/NavBar';

// Mirrors GAMBLING in server/src/mafia/config.ts — small, fixed numbers
// shown as static copy, same convention as every other page in this app.
const DICE_MIN = 100, DICE_MAX = 25_000;
const SLOTS_MIN = 100, SLOTS_MAX = 25_000;
const ROULETTE_MIN = 100, ROULETTE_MAX = 25_000;
const BLACKJACK_MIN = 100, BLACKJACK_MAX = 25_000;

interface MeData {
  cash: number;
  status: 'ALIVE' | 'DEAD' | 'JAIL' | 'HOSPITAL';
}

interface LogEntry {
  id: number;
  text: string;
  good: boolean;
}

type DiceBetType = 'under' | 'seven' | 'over';
type RouletteOutsideBet = 'red' | 'black' | 'odd' | 'even' | 'number';

export default function GamblingPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const logId = useRef(0);

  const [diceAmount, setDiceAmount] = useState(String(DICE_MIN));
  const [diceBetType, setDiceBetType] = useState<DiceBetType>('seven');
  const [diceBusy, setDiceBusy] = useState(false);
  const [diceResult, setDiceResult] = useState<string | null>(null);

  const [slotsAmount, setSlotsAmount] = useState(String(SLOTS_MIN));
  const [slotsBusy, setSlotsBusy] = useState(false);
  const [slotsResult, setSlotsResult] = useState<string | null>(null);

  const [rouletteAmount, setRouletteAmount] = useState(String(ROULETTE_MIN));
  const [rouletteBetKind, setRouletteBetKind] = useState<RouletteOutsideBet>('red');
  const [rouletteNumber, setRouletteNumber] = useState('7');
  const [rouletteBusy, setRouletteBusy] = useState(false);
  const [rouletteResult, setRouletteResult] = useState<string | null>(null);

  const [blackjackAmount, setBlackjackAmount] = useState(String(BLACKJACK_MIN));
  const [blackjackBusy, setBlackjackBusy] = useState(false);
  const [blackjackResult, setBlackjackResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await apiFetch<MeData>('/api/v1/me');
    if (!res.ok || !res.data) {
      setError(res.error?.message ?? 'Could not load your profile.');
      return;
    }
    setMe(res.data);
    setError(null);
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    load();
  }, [router, load]);

  function addLog(text: string, good: boolean) {
    logId.current += 1;
    setLog((prev) => [{ id: logId.current, text, good }, ...prev].slice(0, 12));
  }

  async function playDice() {
    const amount = Number(diceAmount);
    if (!Number.isInteger(amount) || amount < DICE_MIN || amount > DICE_MAX) {
      setError(`Dice bets must be a whole number between $${DICE_MIN.toLocaleString()} and $${DICE_MAX.toLocaleString()}.`);
      return;
    }
    setDiceBusy(true);
    setError(null);
    const res = await apiFetch<{ die1: number; die2: number; sum: number; won: boolean; netChange: number }>(
      '/api/v1/mafia/gambling/dice',
      { method: 'POST', body: JSON.stringify({ amount, betType: diceBetType }) }
    );
    setDiceBusy(false);
    if (!res.ok || !res.data) {
      setError(res.error?.message ?? 'That roll failed to go through.');
      return;
    }
    const { die1, die2, sum, won, netChange } = res.data;
    const text = `🎲 ${die1} + ${die2} = ${sum} — ${won ? `won $${netChange.toLocaleString()}` : `lost $${Math.abs(netChange).toLocaleString()}`}`;
    setDiceResult(text);
    addLog(text, won);
    await load();
  }

  async function playSlots() {
    const amount = Number(slotsAmount);
    if (!Number.isInteger(amount) || amount < SLOTS_MIN || amount > SLOTS_MAX) {
      setError(`Slots bets must be a whole number between $${SLOTS_MIN.toLocaleString()} and $${SLOTS_MAX.toLocaleString()}.`);
      return;
    }
    setSlotsBusy(true);
    setError(null);
    const res = await apiFetch<{ reels: [string, string, string]; won: boolean; netChange: number }>(
      '/api/v1/mafia/gambling/slots',
      { method: 'POST', body: JSON.stringify({ amount }) }
    );
    setSlotsBusy(false);
    if (!res.ok || !res.data) {
      setError(res.error?.message ?? 'That spin failed to go through.');
      return;
    }
    const { reels, won, netChange } = res.data;
    const text = `🎰 ${reels.join(' ')} — ${won ? `won $${netChange.toLocaleString()}` : `lost $${Math.abs(netChange).toLocaleString()}`}`;
    setSlotsResult(text);
    addLog(text, won);
    await load();
  }

  async function playRoulette() {
    const amount = Number(rouletteAmount);
    if (!Number.isInteger(amount) || amount < ROULETTE_MIN || amount > ROULETTE_MAX) {
      setError(`Roulette bets must be a whole number between $${ROULETTE_MIN.toLocaleString()} and $${ROULETTE_MAX.toLocaleString()}.`);
      return;
    }
    const bet =
      rouletteBetKind === 'number'
        ? { type: 'number' as const, number: Number(rouletteNumber) }
        : rouletteBetKind === 'red' || rouletteBetKind === 'black'
          ? { type: 'color' as const, color: rouletteBetKind }
          : { type: 'parity' as const, parity: rouletteBetKind };

    if (bet.type === 'number' && (!Number.isInteger(bet.number) || bet.number < 0 || bet.number > 36)) {
      setError('Straight-up bets must be a number from 0 to 36.');
      return;
    }

    setRouletteBusy(true);
    setError(null);
    const res = await apiFetch<{ number: number; color: 'red' | 'black' | 'green'; won: boolean; netChange: number }>(
      '/api/v1/mafia/gambling/roulette',
      { method: 'POST', body: JSON.stringify({ amount, bet }) }
    );
    setRouletteBusy(false);
    if (!res.ok || !res.data) {
      setError(res.error?.message ?? 'That spin failed to go through.');
      return;
    }
    const { number, color, won, netChange } = res.data;
    const colorEmoji = color === 'red' ? '🔴' : color === 'black' ? '⚫' : '🟢';
    const text = `🎡 ${number} ${colorEmoji} — ${won ? `won $${netChange.toLocaleString()}` : `lost $${Math.abs(netChange).toLocaleString()}`}`;
    setRouletteResult(text);
    addLog(text, won);
    await load();
  }

  async function playBlackjack() {
    const amount = Number(blackjackAmount);
    if (!Number.isInteger(amount) || amount < BLACKJACK_MIN || amount > BLACKJACK_MAX) {
      setError(`Blackjack bets must be a whole number between $${BLACKJACK_MIN.toLocaleString()} and $${BLACKJACK_MAX.toLocaleString()}.`);
      return;
    }
    setBlackjackBusy(true);
    setError(null);
    const res = await apiFetch<{
      playerCards: { rank: string; suit: string }[];
      dealerCards: { rank: string; suit: string }[];
      playerTotal: number;
      dealerTotal: number;
      result: 'blackjack' | 'win' | 'lose' | 'push';
      netChange: number;
    }>('/api/v1/mafia/gambling/blackjack', { method: 'POST', body: JSON.stringify({ amount }) });
    setBlackjackBusy(false);
    if (!res.ok || !res.data) {
      setError(res.error?.message ?? 'That hand failed to go through.');
      return;
    }
    const { playerCards, dealerCards, playerTotal, dealerTotal, result, netChange } = res.data;
    const fmt = (cards: { rank: string; suit: string }[]) => cards.map((c) => `${c.rank}${c.suit}`).join(' ');
    const outcomeWord = result === 'blackjack' ? 'BLACKJACK! won' : result === 'win' ? 'won' : result === 'push' ? 'push, bet returned' : 'lost';
    const text = `🃏 You: ${fmt(playerCards)} (${playerTotal}) — Dealer: ${fmt(dealerCards)} (${dealerTotal}) — ${outcomeWord}${netChange !== 0 ? ` $${Math.abs(netChange).toLocaleString()}` : ''}`;
    setBlackjackResult(text);
    addLog(text, netChange >= 0);
    await load();
  }

  if (!me) return <main style={pageStyle}><p>{error ?? 'Loading…'}</p></main>;

  const isAlive = me.status === 'ALIVE';

  return (
    <main style={pageStyle}>
      <div style={{ width: '100%', maxWidth: 640 }}>
        <NavBar />

        <h1 style={{ margin: '16px 0 4px' }}>Casino</h1>
        <p style={{ color: '#999', marginTop: 0 }}>
          Four games, every bet capped and settled instantly — nothing here is ever unlimited-money.
          Cash: <strong>${me.cash.toLocaleString()}</strong>
        </p>

        {!isAlive && (
          <div style={warningBannerStyle}>You can&apos;t gamble right now — you&apos;re {me.status.toLowerCase()}.</div>
        )}
        {error && <p style={{ color: '#f87171', fontSize: 14 }}>{error}</p>}

        <div style={gameGridStyle}>
          <div style={cardStyle}>
            <h3 style={cardTitleStyle}>🎲 Dice</h3>
            <p style={activityCopyStyle}>Two dice. Bet UNDER (2-6), SEVEN (exactly 7, pays more), or OVER (8-12).</p>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <input type="number" value={diceAmount} onChange={(e) => setDiceAmount(e.target.value)} min={DICE_MIN} max={DICE_MAX} style={inputStyle} />
              <select value={diceBetType} onChange={(e) => setDiceBetType(e.target.value as DiceBetType)} style={selectStyle}>
                <option value="under">Under</option>
                <option value="seven">Seven</option>
                <option value="over">Over</option>
              </select>
            </div>
            <button onClick={playDice} disabled={diceBusy || !isAlive} style={diceBusy || !isAlive ? buttonDisabledStyle : buttonStyle}>
              {diceBusy ? 'Rolling…' : 'Roll'}
            </button>
            {diceResult && <p style={resultTextStyle}>{diceResult}</p>}
          </div>

          <div style={cardStyle}>
            <h3 style={cardTitleStyle}>🎰 Slots</h3>
            <p style={activityCopyStyle}>Three reels. Match three for a jackpot, or land two 🍒 for a small payout.</p>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <input type="number" value={slotsAmount} onChange={(e) => setSlotsAmount(e.target.value)} min={SLOTS_MIN} max={SLOTS_MAX} style={inputStyle} />
            </div>
            <button onClick={playSlots} disabled={slotsBusy || !isAlive} style={slotsBusy || !isAlive ? buttonDisabledStyle : buttonStyle}>
              {slotsBusy ? 'Spinning…' : 'Spin'}
            </button>
            {slotsResult && <p style={resultTextStyle}>{slotsResult}</p>}
          </div>

          <div style={cardStyle}>
            <h3 style={cardTitleStyle}>🎡 Roulette</h3>
            <p style={activityCopyStyle}>Single-zero wheel. Color/odd-even pay even money; a straight-up number pays 35:1.</p>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              <input type="number" value={rouletteAmount} onChange={(e) => setRouletteAmount(e.target.value)} min={ROULETTE_MIN} max={ROULETTE_MAX} style={inputStyle} />
              <select value={rouletteBetKind} onChange={(e) => setRouletteBetKind(e.target.value as RouletteOutsideBet)} style={selectStyle}>
                <option value="red">Red</option>
                <option value="black">Black</option>
                <option value="odd">Odd</option>
                <option value="even">Even</option>
                <option value="number">Number</option>
              </select>
              {rouletteBetKind === 'number' && (
                <input type="number" value={rouletteNumber} onChange={(e) => setRouletteNumber(e.target.value)} min={0} max={36} style={{ ...inputStyle, maxWidth: 70 }} />
              )}
            </div>
            <button onClick={playRoulette} disabled={rouletteBusy || !isAlive} style={rouletteBusy || !isAlive ? buttonDisabledStyle : buttonStyle}>
              {rouletteBusy ? 'Spinning…' : 'Spin'}
            </button>
            {rouletteResult && <p style={resultTextStyle}>{rouletteResult}</p>}
          </div>

          <div style={cardStyle}>
            <h3 style={cardTitleStyle}>🃏 Blackjack</h3>
            <p style={activityCopyStyle}>Auto-played — place a bet and the hand plays itself (stands on 17+). Natural 21 pays 3:2.</p>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <input type="number" value={blackjackAmount} onChange={(e) => setBlackjackAmount(e.target.value)} min={BLACKJACK_MIN} max={BLACKJACK_MAX} style={inputStyle} />
            </div>
            <button onClick={playBlackjack} disabled={blackjackBusy || !isAlive} style={blackjackBusy || !isAlive ? buttonDisabledStyle : buttonStyle}>
              {blackjackBusy ? 'Dealing…' : 'Deal'}
            </button>
            {blackjackResult && <p style={resultTextStyle}>{blackjackResult}</p>}
          </div>
        </div>

        {log.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <h3 style={{ fontSize: 14, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recent activity</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {log.map((entry) => (
                <li
                  key={entry.id}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 6,
                    background: '#16161d',
                    border: '1px solid #26262f',
                    marginBottom: 8,
                    fontSize: 13,
                    color: entry.good ? '#4ade80' : '#f87171',
                  }}
                >
                  {entry.text}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}

const pageStyle: CSSProperties = { minHeight: '100vh', display: 'flex', justifyContent: 'center', padding: '48px 24px' };
const cardStyle: CSSProperties = { background: '#16161d', border: '1px solid #26262f', borderRadius: 8, padding: 16 };
const cardTitleStyle: CSSProperties = { margin: '0 0 6px', fontSize: 15 };
const gameGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginTop: 8 };
const activityCopyStyle: CSSProperties = { color: '#999', fontSize: 13, margin: '0 0 12px' };
const resultTextStyle: CSSProperties = { fontSize: 13, color: '#ccc', margin: '10px 0 0', wordBreak: 'break-word' };
const warningBannerStyle: CSSProperties = {
  background: '#26220f',
  border: '1px solid #facc15',
  color: '#facc15',
  borderRadius: 8,
  padding: '10px 14px',
  fontSize: 14,
  marginBottom: 16,
};
const inputStyle: CSSProperties = {
  flex: 1,
  background: '#0d0d12',
  border: '1px solid #333',
  color: '#fff',
  padding: '10px 12px',
  borderRadius: 4,
  fontSize: 14,
  width: 0,
  minWidth: 80,
};
const selectStyle: CSSProperties = {
  background: '#0d0d12',
  border: '1px solid #333',
  color: '#fff',
  padding: '10px 12px',
  borderRadius: 4,
  fontSize: 14,
};
const buttonStyle: CSSProperties = {
  padding: '10px 16px',
  background: '#b91c1c',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: 13,
  width: '100%',
};
const buttonDisabledStyle: CSSProperties = {
  ...buttonStyle,
  background: '#333',
  color: '#777',
  cursor: 'not-allowed',
};
