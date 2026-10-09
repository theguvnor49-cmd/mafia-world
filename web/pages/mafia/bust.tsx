import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/router';
import { apiFetch, getToken } from '../../lib/api';
import NavBar from '../../components/NavBar';

interface MeStats {
  status: 'ALIVE' | 'DEAD' | 'JAIL' | 'HOSPITAL';
  stats: {
    successfulBusts: number;
    failedBusts: number;
    timesArrested: number;
    jailSecondsServed: number;
  };
}

interface BustOutcome {
  success: boolean;
  cashReward: number;
  prisonerUsername: string;
}

interface LogEntry {
  id: number;
  text: string;
  success: boolean;
}

export default function BustPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeStats | null>(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const logId = useRef(0);

  const loadMe = useCallback(async () => {
    const res = await apiFetch<MeStats>('/api/v1/me');
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
    loadMe();
  }, [router, loadMe]);

  async function attemptBust() {
    if (!usernameInput.trim()) return;
    setBusy(true);
    setError(null);
    const res = await apiFetch<BustOutcome>('/api/v1/mafia/jail/bust', {
      method: 'POST',
      body: JSON.stringify({ targetUsername: usernameInput.trim() }),
    });
    setBusy(false);

    if (!res.ok || !res.data) {
      setError(res.error?.message ?? 'That bust attempt failed to even start.');
      return;
    }

    const outcome = res.data;
    const text = outcome.success
      ? `Busted ${outcome.prisonerUsername} out of jail and earned $${outcome.cashReward.toLocaleString()}.`
      : `Tried to bust ${outcome.prisonerUsername} out — the attempt failed.`;

    logId.current += 1;
    setLog((prev) => [{ id: logId.current, text, success: outcome.success }, ...prev].slice(0, 10));
    setUsernameInput('');
    await loadMe();
  }

  if (error && !me) return <main style={pageStyle}><p>{error}</p></main>;
  if (!me) return <main style={pageStyle}><p>Loading…</p></main>;

  const canAttempt = me.status === 'ALIVE' && !busy && usernameInput.trim().length > 0;

  return (
    <main style={pageStyle}>
      <div style={{ width: '100%', maxWidth: 560 }}>
        <NavBar />

        <h1 style={{ margin: '16px 0 4px' }}>Jail Bust-Out</h1>
        <p style={{ color: '#999', marginTop: 0 }}>
          Spring another player from jail. You both need to be in the same state, and they
          actually need to be locked up right now. Your own track record as a buster — more
          successes, more failures — shifts your odds.
        </p>

        <div style={statRowStyle}>
          <Stat label="Successful Busts" value={me.stats.successfulBusts.toLocaleString()} />
          <Stat label="Failed Busts" value={me.stats.failedBusts.toLocaleString()} />
          <Stat label="Times Arrested" value={me.stats.timesArrested.toLocaleString()} />
        </div>

        <div style={cardStyle}>
          <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>Bust someone out</h2>

          {me.status !== 'ALIVE' && (
            <p style={{ color: '#f87171', fontSize: 14 }}>
              You can&apos;t do that right now — you&apos;re {me.status.toLowerCase()}.
            </p>
          )}
          {error && <p style={{ color: '#f87171', fontSize: 14 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              placeholder="Prisoner's username"
              style={inputStyle}
            />
            <button onClick={attemptBust} disabled={!canAttempt} style={canAttempt ? buttonStyle : buttonDisabledStyle}>
              {busy ? 'Busting…' : 'Bust Out'}
            </button>
          </div>
        </div>

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
                    color: entry.success ? '#4ade80' : '#f87171',
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#16161d', border: '1px solid #26262f', borderRadius: 8, padding: 16 }}>
      <div style={{ fontSize: 12, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  );
}

const pageStyle: CSSProperties = { minHeight: '100vh', display: 'flex', justifyContent: 'center', padding: '48px 24px' };
const statRowStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 };
const cardStyle: CSSProperties = { background: '#16161d', border: '1px solid #26262f', borderRadius: 8, padding: 20 };
const inputStyle: CSSProperties = {
  flex: 1,
  background: '#0d0d12',
  border: '1px solid #333',
  color: '#fff',
  padding: '10px 12px',
  borderRadius: 4,
  fontSize: 14,
};
const buttonStyle: CSSProperties = {
  padding: '10px 20px',
  background: '#b91c1c',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: 14,
};
const buttonDisabledStyle: CSSProperties = {
  ...buttonStyle,
  background: '#333',
  color: '#777',
  cursor: 'not-allowed',
};
