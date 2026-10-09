import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/router';
import { apiFetch, getToken } from '../../lib/api';
import NavBar from '../../components/NavBar';

interface MeStatus {
  status: 'ALIVE' | 'DEAD' | 'JAIL' | 'HOSPITAL';
  premium_points: number;
  deadUntil: string | null;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function RevivePage() {
  const router = useRouter();
  const [me, setMe] = useState<MeStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await apiFetch<MeStatus>('/api/v1/me');
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

  async function revive() {
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await apiFetch('/api/v1/mafia/revive', { method: 'POST' });
    setBusy(false);
    if (!res.ok) {
      setError(res.error?.message ?? 'Could not revive.');
      return;
    }
    setMessage("You're back up.");
    await load();
  }

  if (error && !me) return <main style={pageStyle}><p>{error}</p></main>;
  if (!me) return <main style={pageStyle}><p>Loading…</p></main>;

  const REVIVE_COST = 50; // mirrors PVP.REVIVE_PREMIUM_POINTS — see GAME_DESIGN.md
  const canAfford = me.premium_points >= REVIVE_COST;

  return (
    <main style={pageStyle}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        <NavBar />

        <h1 style={{ margin: '16px 0 4px' }}>Revive</h1>

        {message && <p style={{ color: '#4ade80', fontSize: 14 }}>{message}</p>}
        {error && <p style={{ color: '#f87171', fontSize: 14 }}>{error}</p>}

        {me.status !== 'DEAD' ? (
          <div style={cardStyle}>
            <p style={{ margin: 0 }}>You&apos;re not dead right now.</p>
          </div>
        ) : (
          <div style={cardStyle}>
            <p style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: '#f87171' }}>🔴 YOU ARE DEAD</p>
            {me.deadUntil && (
              <p style={{ color: '#999', fontSize: 14, margin: '0 0 16px' }}>Dead until: {formatWhen(me.deadUntil)}</p>
            )}
            <p style={{ fontSize: 14, margin: '0 0 16px' }}>
              You have <strong>{me.premium_points}</strong> premium points. Reviving costs{' '}
              <strong>{REVIVE_COST}</strong> and skips the hospital recovery stage too — you&apos;re
              back to fully <strong>ALIVE</strong> immediately, not just un-dead.
            </p>
            <button
              onClick={revive}
              disabled={busy || !canAfford}
              style={busy || !canAfford ? buttonDisabledStyle : buttonStyle}
            >
              {busy ? 'Reviving…' : canAfford ? `REVIVE — ${REVIVE_COST} POINTS` : 'Not enough points'}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

const pageStyle: CSSProperties = { minHeight: '100vh', display: 'flex', justifyContent: 'center', padding: '48px 24px' };
const cardStyle: CSSProperties = { background: '#16161d', border: '1px solid #26262f', borderRadius: 8, padding: 20, marginTop: 16 };
const buttonStyle: CSSProperties = {
  padding: '10px 20px',
  background: '#b91c1c',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: 14,
  width: '100%',
};
const buttonDisabledStyle: CSSProperties = {
  ...buttonStyle,
  background: '#333',
  color: '#777',
  cursor: 'not-allowed',
};
