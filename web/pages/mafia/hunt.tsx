import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/router';
import { apiFetch, getToken } from '../../lib/api';
import NavBar from '../../components/NavBar';

interface SearchStatus {
  hunting: boolean;
  ready?: boolean;
  targetUsername?: string | null;
  secondsRemaining?: number;
  revealedState?: string | null;
}

interface KillOutcome {
  success: boolean;
  bulletsUsed: number;
  targetUsername: string;
  witnessCount: number;
}

export default function HuntPage() {
  const router = useRouter();
  const [status, setStatus] = useState<SearchStatus | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [usernameInput, setUsernameInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    const res = await apiFetch<SearchStatus>('/api/v1/mafia/search/status');
    if (!res.ok || !res.data) {
      setError(res.error?.message ?? 'Could not load search status.');
      return;
    }
    setStatus(res.data);
    setCountdown(res.data.secondsRemaining ?? 0);
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

  async function startSearch() {
    if (!usernameInput.trim()) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await apiFetch('/api/v1/mafia/search/start', {
      method: 'POST',
      body: JSON.stringify({ targetUsername: usernameInput.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error?.message ?? 'Could not start that search.');
      return;
    }
    setUsernameInput('');
    setMessage('Search started. Check back in 4 hours.');
    await loadStatus();
  }

  async function attack() {
    if (!status?.targetUsername) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await apiFetch<KillOutcome>('/api/v1/mafia/kill', {
      method: 'POST',
      body: JSON.stringify({ targetUsername: status.targetUsername }),
    });
    setBusy(false);
    if (!res.ok || !res.data) {
      setError(res.error?.message ?? 'The attack failed.');
      await loadStatus();
      return;
    }
    setMessage(
      `You killed ${res.data.targetUsername} using ${res.data.bulletsUsed} bullets. ${res.data.witnessCount} player(s) witnessed it.`
    );
    await loadStatus();
  }

  if (error && !status) return <main style={pageStyle}><p>{error}</p></main>;
  if (!status) return <main style={pageStyle}><p>Loading…</p></main>;

  return (
    <main style={pageStyle}>
      <div style={{ width: '100%', maxWidth: 560 }}>
        <NavBar />

        <h1 style={{ margin: '16px 0 4px' }}>Hunt</h1>
        <p style={{ color: '#999', marginTop: 0 }}>
          Search takes 4 hours before you learn where your target is. If they move before you
          attack, the search fails and you&apos;ll need to start again.
        </p>

        {message && <p style={{ color: '#4ade80', fontSize: 14 }}>{message}</p>}
        {error && <p style={{ color: '#f87171', fontSize: 14 }}>{error}</p>}

        {!status.hunting && (
          <div style={cardStyle}>
            <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>Start a search</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="Target's username"
                style={inputStyle}
              />
              <button
                onClick={startSearch}
                disabled={busy || !usernameInput.trim()}
                style={busy || !usernameInput.trim() ? buttonDisabledStyle : buttonStyle}
              >
                {busy ? 'Starting…' : 'Search'}
              </button>
            </div>
          </div>
        )}

        {status.hunting && !status.ready && (
          <div style={cardStyle}>
            <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Searching for {status.targetUsername}…</h2>
            <p style={{ color: '#999', fontSize: 14 }}>Ready in {countdown}s.</p>
          </div>
        )}

        {status.hunting && status.ready && (
          <div style={cardStyle}>
            <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Search complete</h2>
            <p style={{ fontSize: 14 }}>
              {status.targetUsername} was found in <strong>{status.revealedState}</strong>.
            </p>
            <p style={{ color: '#999', fontSize: 13, margin: '4px 0 16px' }}>
              You need to be in that state yourself, with a gun equipped and enough bullets, to
              attack.
            </p>
            <button onClick={attack} disabled={busy} style={busy ? buttonDisabledStyle : buttonStyle}>
              {busy ? 'Attacking…' : `Attack ${status.targetUsername}`}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

const pageStyle: CSSProperties = { minHeight: '100vh', display: 'flex', justifyContent: 'center', padding: '48px 24px' };
const cardStyle: CSSProperties = { background: '#16161d', border: '1px solid #26262f', borderRadius: 8, padding: 20, marginTop: 16 };
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
