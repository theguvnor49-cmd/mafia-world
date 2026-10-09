import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/router';
import { apiFetch, getToken } from '../../lib/api';
import NavBar from '../../components/NavBar';

// Mirrors HOSPITAL in server/src/mafia/config.ts — small, fixed numbers
// shown as static copy, same convention as every other page in this app
// (e.g. bust.tsx's "base 25% success" text) rather than fetched from a
// dedicated config endpoint.
const TREATMENT_COST = 10_000;
const GAMBLE_MIN_BET = 500;
const GAMBLE_MAX_BET = 5_000;
const SMALL_JOB_CASH_REWARD = 2_000;
const SMALL_JOB_XP_REWARD = 10;

interface MeData {
  cash: number;
  status: 'ALIVE' | 'DEAD' | 'JAIL' | 'HOSPITAL';
}

interface HospitalStatus {
  inHospital: boolean;
  hospitalUntil: string | null;
  secondsRemaining: number;
  recoveryPercent: number;
  smallJobOnCooldown: boolean;
  smallJobSecondsRemaining: number;
}

interface LogEntry {
  id: number;
  text: string;
  good: boolean;
}

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function HospitalPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeData | null>(null);
  const [status, setStatus] = useState<HospitalStatus | null>(null);
  const [betInput, setBetInput] = useState(String(GAMBLE_MIN_BET));
  const [busy, setBusy] = useState<'treat' | 'gamble' | 'job' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const logId = useRef(0);

  const load = useCallback(async () => {
    const [meRes, statusRes] = await Promise.all([
      apiFetch<MeData>('/api/v1/me'),
      apiFetch<HospitalStatus>('/api/v1/mafia/hospital/status'),
    ]);
    setLoaded(true);
    if (!meRes.ok || !meRes.data) {
      setError(meRes.error?.message ?? 'Could not load your profile.');
      return;
    }
    setMe(meRes.data);
    if (statusRes.ok && statusRes.data) {
      setStatus(statusRes.data);
      setError(null);
    }
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    load();
  }, [router, load]);

  // Purely cosmetic client-side tick, same pattern as every other
  // countdown in this app — the server's own timestamps are authoritative;
  // this just counts down to them, then re-fetches to confirm.
  useEffect(() => {
    if (!status || (status.secondsRemaining <= 0 && status.smallJobSecondsRemaining <= 0)) return;
    const id = setInterval(() => {
      setStatus((s) => {
        if (!s) return s;
        const next = {
          ...s,
          secondsRemaining: Math.max(0, s.secondsRemaining - 1),
          smallJobSecondsRemaining: Math.max(0, s.smallJobSecondsRemaining - 1),
        };
        if (s.secondsRemaining <= 1) load();
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [status, load]);

  function addLog(text: string, good: boolean) {
    logId.current += 1;
    setLog((prev) => [{ id: logId.current, text, good }, ...prev].slice(0, 10));
  }

  async function treat() {
    setBusy('treat');
    setError(null);
    const res = await apiFetch<{ recovered: boolean }>('/api/v1/mafia/hospital/treat', { method: 'POST' });
    setBusy(null);
    if (!res.ok || !res.data) {
      setError(res.error?.message ?? 'Treatment failed.');
      return;
    }
    addLog(
      res.data.recovered ? `Treatment finished the job — you're fully recovered.` : `Treatment knocked 30 minutes off your recovery.`,
      true
    );
    await load();
  }

  async function gamble() {
    const amount = Number(betInput);
    if (!Number.isInteger(amount) || amount < GAMBLE_MIN_BET || amount > GAMBLE_MAX_BET) {
      setError(`Bet must be a whole number between $${GAMBLE_MIN_BET.toLocaleString()} and $${GAMBLE_MAX_BET.toLocaleString()}.`);
      return;
    }
    setBusy('gamble');
    setError(null);
    const res = await apiFetch<{ won: boolean; netChange: number }>('/api/v1/mafia/hospital/gamble', {
      method: 'POST',
      body: JSON.stringify({ amount }),
    });
    setBusy(null);
    if (!res.ok || !res.data) {
      setError(res.error?.message ?? 'That bet failed to go through.');
      return;
    }
    addLog(
      res.data.won
        ? `Won the flip — up $${res.data.netChange.toLocaleString()}.`
        : `Lost the flip — down $${Math.abs(res.data.netChange).toLocaleString()}.`,
      res.data.won
    );
    await load();
  }

  async function smallJob() {
    setBusy('job');
    setError(null);
    const res = await apiFetch<{ cashReward: number; xpReward: number }>('/api/v1/mafia/hospital/job', { method: 'POST' });
    setBusy(null);
    if (!res.ok || !res.data) {
      setError(res.error?.message ?? 'Could not pick up a small job.');
      return;
    }
    addLog(`Small job paid $${res.data.cashReward.toLocaleString()} + ${res.data.xpReward} XP.`, true);
    await load();
  }

  if (!loaded) return <main style={pageStyle}><p>Loading…</p></main>;
  if (error && !me) return <main style={pageStyle}><p>{error}</p></main>;
  if (!me || !status) return <main style={pageStyle}><p>Loading…</p></main>;

  const canAffordTreatment = me.cash >= TREATMENT_COST;

  return (
    <main style={pageStyle}>
      <div style={{ width: '100%', maxWidth: 560 }}>
        <NavBar />

        <h1 style={{ margin: '16px 0 4px' }}>Hospital</h1>
        <p style={{ color: '#999', marginTop: 0 }}>
          Recovering costs time, not just a blank wait screen — rest for free, or spend cash and
          take a few small risks to pass the time (or shorten it).
        </p>

        {error && <p style={{ color: '#f87171', fontSize: 14 }}>{error}</p>}

        {!status.inHospital ? (
          <div style={cardStyle}>
            <p style={{ margin: 0, color: '#999', fontSize: 14 }}>You&apos;re not in the hospital right now.</p>
          </div>
        ) : (
          <>
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 6 }}>
                <span>Recovery</span>
                <span>{status.recoveryPercent}%</span>
              </div>
              <div style={barOuterStyle}>
                <div style={{ ...barInnerStyle, width: `${status.recoveryPercent}%` }} />
              </div>
              <p style={{ color: '#60a5fa', fontSize: 14, margin: '10px 0 0' }}>
                🏥 Fully recovered in {formatDuration(status.secondsRemaining)}
              </p>
            </div>

            <h2 style={sectionHeadingStyle}>Recovery activities</h2>
            <div style={activityGridStyle}>
              <div style={cardStyle}>
                <h3 style={{ margin: '0 0 6px', fontSize: 15 }}>💊 Medical treatment</h3>
                <p style={activityCopyStyle}>Spend ${TREATMENT_COST.toLocaleString()} to knock 30 minutes off your stay.</p>
                <button
                  onClick={treat}
                  disabled={busy !== null || !canAffordTreatment}
                  style={busy !== null || !canAffordTreatment ? buttonDisabledStyle : buttonStyle}
                >
                  {busy === 'treat' ? 'Treating…' : canAffordTreatment ? 'Get treatment' : 'Not enough cash'}
                </button>
              </div>

              <div style={cardStyle}>
                <h3 style={{ margin: '0 0 6px', fontSize: 15 }}>🎲 Limited gambling</h3>
                <p style={activityCopyStyle}>
                  Double or nothing, 50/50. Bets from ${GAMBLE_MIN_BET.toLocaleString()} to ${GAMBLE_MAX_BET.toLocaleString()}.
                </p>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="number"
                    value={betInput}
                    onChange={(e) => setBetInput(e.target.value)}
                    min={GAMBLE_MIN_BET}
                    max={GAMBLE_MAX_BET}
                    style={inputStyle}
                  />
                  <button onClick={gamble} disabled={busy !== null} style={busy !== null ? buttonDisabledStyle : buttonStyle}>
                    {busy === 'gamble' ? '…' : 'Flip'}
                  </button>
                </div>
              </div>

              <div style={cardStyle}>
                <h3 style={{ margin: '0 0 6px', fontSize: 15 }}>🧹 Small jobs</h3>
                <p style={activityCopyStyle}>
                  Always pays ${SMALL_JOB_CASH_REWARD.toLocaleString()} + {SMALL_JOB_XP_REWARD} XP — no risk, nothing to lose.
                </p>
                <button
                  onClick={smallJob}
                  disabled={busy !== null || status.smallJobSecondsRemaining > 0}
                  style={busy !== null || status.smallJobSecondsRemaining > 0 ? buttonDisabledStyle : buttonStyle}
                >
                  {busy === 'job'
                    ? 'Working…'
                    : status.smallJobSecondsRemaining > 0
                      ? `Wait ${formatDuration(status.smallJobSecondsRemaining)}`
                      : 'Do a small job'}
                </button>
              </div>
            </div>
          </>
        )}

        {log.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <h3 style={{ fontSize: 14, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Recent activity
            </h3>
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
                    fontSize: 14,
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
const cardStyle: CSSProperties = { background: '#16161d', border: '1px solid #26262f', borderRadius: 8, padding: 16, marginBottom: 16 };
const sectionHeadingStyle: CSSProperties = { marginTop: 8, marginBottom: 12, fontSize: 16, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em' };
const activityGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 };
const activityCopyStyle: CSSProperties = { color: '#999', fontSize: 13, margin: '0 0 12px' };
const barOuterStyle: CSSProperties = { height: 10, background: '#0d0d12', border: '1px solid #26262f', borderRadius: 6, overflow: 'hidden' };
const barInnerStyle: CSSProperties = { height: '100%', background: '#60a5fa', borderRadius: 6, transition: 'width 0.3s' };
const inputStyle: CSSProperties = {
  flex: 1,
  background: '#0d0d12',
  border: '1px solid #333',
  color: '#fff',
  padding: '10px 12px',
  borderRadius: 4,
  fontSize: 14,
  width: 0,
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
