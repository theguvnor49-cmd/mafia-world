import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/router';
import { apiFetch, getToken } from '../../lib/api';
import NavBar from '../../components/NavBar';

interface CrimeStatus {
  status: 'ALIVE' | 'DEAD' | 'JAIL' | 'HOSPITAL';
  onCooldown: boolean;
  secondsRemaining: number;
  effectiveHeat: number;
}

interface GtaOutcome {
  success: boolean;
  cashReward: number;
  xpReward: number;
  heat: number;
  jailSeconds: number;
  jailUntil: string | null;
  vehicleDropped: { name: string; rarity: string } | null;
}

interface LogEntry {
  id: number;
  text: string;
  success: boolean;
}

export default function CrimesPage() {
  const router = useRouter();
  const [status, setStatus] = useState<CrimeStatus | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const logId = useRef(0);

  const loadStatus = useCallback(async () => {
    const res = await apiFetch<CrimeStatus>('/api/v1/mafia/crime/gta/status');
    if (!res.ok || !res.data) {
      setError(res.error?.message ?? 'Could not load crime status.');
      return;
    }
    setStatus(res.data);
    setCountdown(res.data.secondsRemaining);
    setError(null);
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    loadStatus();
  }, [router, loadStatus]);

  useEffect(() => {
    if (countdown <= 0) return;
    const id = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [countdown]);

  async function attemptGta() {
    setBusy(true);
    setError(null);
    const res = await apiFetch<GtaOutcome>('/api/v1/mafia/crime/gta', { method: 'POST' });
    setBusy(false);

    if (!res.ok || !res.data) {
      setError(res.error?.message ?? 'That crime failed to even start.');
      await loadStatus();
      return;
    }

    const outcome = res.data;
    const vehicleText = outcome.vehicleDropped
      ? ` You also drove off with a ${outcome.vehicleDropped.rarity} ${outcome.vehicleDropped.name} — check the garage.`
      : '';
    const text = outcome.success
      ? `Stole a car and made $${outcome.cashReward.toLocaleString()} (+${outcome.xpReward} XP).${vehicleText}`
      : outcome.jailSeconds > 0
        ? `Botched it and got ${outcome.jailSeconds}s in jail (+${outcome.xpReward} XP).`
        : `Botched it (+${outcome.xpReward} XP).`;

    logId.current += 1;
    setLog((prev) => [{ id: logId.current, text, success: outcome.success }, ...prev].slice(0, 10));
    await loadStatus();
  }

  if (error && !status) return <main style={pageStyle}><p>{error}</p></main>;
  if (!status) return <main style={pageStyle}><p>Loading…</p></main>;

  const canAttempt = status.status === 'ALIVE' && countdown <= 0 && !busy;

  return (
    <main style={pageStyle}>
      <div style={{ width: '100%', maxWidth: 560 }}>
        <NavBar />

        <h1 style={{ margin: '16px 0 4px' }}>Crimes</h1>
        <p style={{ color: '#999', marginTop: 0 }}>Heat: {status.effectiveHeat} / 100</p>

        <div style={cardStyle}>
          <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Grand Theft Auto</h2>
          <p style={{ color: '#999', fontSize: 14, margin: '0 0 16px' }}>
            Steal a car for a quick payday. 10 minute cooldown either way — fail it and you might
            also catch a short stay in jail.
          </p>

          {status.status !== 'ALIVE' && (
            <p style={{ color: '#f87171', fontSize: 14 }}>
              You can&apos;t do crimes right now — you&apos;re {status.status.toLowerCase()}.
            </p>
          )}

          {error && <p style={{ color: '#f87171', fontSize: 14 }}>{error}</p>}

          <button onClick={attemptGta} disabled={!canAttempt} style={canAttempt ? buttonStyle : buttonDisabledStyle}>
            {busy ? 'Working…' : countdown > 0 ? `Cooldown: ${countdown}s` : 'Attempt GTA'}
          </button>
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

const pageStyle: CSSProperties = { minHeight: '100vh', display: 'flex', justifyContent: 'center', padding: '48px 24px' };
const cardStyle: CSSProperties = { background: '#16161d', border: '1px solid #26262f', borderRadius: 8, padding: 20 };
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
