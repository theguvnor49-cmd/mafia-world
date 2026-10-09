import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { apiFetch, getToken } from '../../lib/api';
import NavBar from '../../components/NavBar';

interface MeData {
  isAdmin: boolean;
}

interface PlayerSummary {
  username: string;
  state: string;
  cash: number;
  premiumPoints: number;
  rank: string;
  status: string;
  isAdmin: boolean;
  createdAt: string;
  lastSeen: string;
}

interface PlayerDetail {
  username: string;
  state: string;
  cash: number;
  premiumPoints: number;
  mafiaXp: number;
  rank: string;
  bullets: number;
  heat: number;
  status: string;
  deadUntil: string | null;
  jailUntil: string | null;
  hospitalUntil: string | null;
  isAdmin: boolean;
  stats: {
    crimesCommitted: number;
    crimesSucceeded: number;
    crimesFailed: number;
    kills: number;
    deaths: number;
    cashEarned: number;
    cashLost: number;
    cashSpent: number;
    timesArrested: number;
    successfulBusts: number;
    failedBusts: number;
  };
}

/**
 * Admin tools (Phase 13) — gated client-side on `me.isAdmin` purely so a
 * non-admin sees a clean "not authorized" message instead of a page full
 * of forms that will all 403; every actual action is re-checked
 * server-side by `requireAdmin` regardless (see routes/admin.ts), so this
 * page's own gate is a UX nicety, not the real security boundary.
 */
export default function AdminPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeData | null>(null);
  const [checked, setChecked] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<PlayerSummary[] | null>(null);
  const [detail, setDetail] = useState<PlayerDetail | null>(null);
  const [cashAmount, setCashAmount] = useState('');
  const [pointsAmount, setPointsAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    apiFetch<MeData>('/api/v1/me').then((res) => {
      if (res.ok && res.data) setMe(res.data);
      setChecked(true);
    });
  }, [router]);

  const loadDetail = useCallback(async (username: string) => {
    setError(null);
    setMessage(null);
    const res = await apiFetch<PlayerDetail>(`/api/v1/admin/players/${encodeURIComponent(username)}`);
    if (!res.ok || !res.data) {
      setError(res.error?.message ?? 'Could not load that player.');
      return;
    }
    setDetail(res.data);
  }, []);

  async function runSearch(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const res = await apiFetch<PlayerSummary[]>(`/api/v1/admin/players?search=${encodeURIComponent(search)}`);
    if (!res.ok || !res.data) {
      setError(res.error?.message ?? 'Search failed.');
      return;
    }
    setResults(res.data);
  }

  async function runAction<T>(key: string, path: string, body?: Record<string, unknown>): Promise<T | null> {
    setBusy(key);
    setError(null);
    setMessage(null);
    const res = await apiFetch<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
    setBusy(null);
    if (!res.ok || !res.data) {
      setError(res.error?.message ?? 'That action failed.');
      return null;
    }
    return res.data;
  }

  async function grantCash() {
    if (!detail) return;
    const amount = Number(cashAmount);
    if (!Number.isInteger(amount) || amount === 0) {
      setError('Enter a non-zero whole number (negative to deduct).');
      return;
    }
    const result = await runAction<{ newCash: number }>('cash', `/api/v1/admin/players/${encodeURIComponent(detail.username)}/grant-cash`, {
      amount,
    });
    if (result) {
      setMessage(`${detail.username}'s cash is now $${result.newCash.toLocaleString()}.`);
      setCashAmount('');
      await loadDetail(detail.username);
    }
  }

  async function grantPoints() {
    if (!detail) return;
    const amount = Number(pointsAmount);
    if (!Number.isInteger(amount) || amount === 0) {
      setError('Enter a non-zero whole number (negative to deduct).');
      return;
    }
    const result = await runAction<{ newPremiumPoints: number }>(
      'points',
      `/api/v1/admin/players/${encodeURIComponent(detail.username)}/grant-premium-points`,
      { amount }
    );
    if (result) {
      setMessage(`${detail.username} now has ${result.newPremiumPoints} premium points.`);
      setPointsAmount('');
      await loadDetail(detail.username);
    }
  }

  async function clearStatus() {
    if (!detail) return;
    const result = await runAction<{ previousStatus: string }>('clear', `/api/v1/admin/players/${encodeURIComponent(detail.username)}/clear-status`);
    if (result) {
      setMessage(`${detail.username} is ALIVE again (was ${result.previousStatus}).`);
      await loadDetail(detail.username);
    }
  }

  if (!checked) return <main style={pageStyle}><p>Loading…</p></main>;

  if (!me?.isAdmin) {
    return (
      <main style={pageStyle}>
        <div style={{ width: '100%', maxWidth: 480, textAlign: 'center' }}>
          <h1>Not authorized</h1>
          <p style={{ color: '#999' }}>This page is admin-only.</p>
          <Link href="/mafia" style={navLinkStyle}>← Back to dashboard</Link>
        </div>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <div style={{ width: '100%', maxWidth: 680 }}>
        <NavBar />

        <h1 style={{ margin: '16px 0 4px' }}>Admin</h1>
        <p style={{ color: '#999', marginTop: 0 }}>
          Look up any player, grant or correct cash/premium points, or clear a stuck status. Every action here is
          logged.
        </p>

        {message && <p style={{ color: '#4ade80', fontSize: 14 }}>{message}</p>}
        {error && <p style={{ color: '#f87171', fontSize: 14 }}>{error}</p>}

        <form onSubmit={runSearch} style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by username…"
            style={inputStyle}
          />
          <button type="submit" style={buttonStyle}>Search</button>
        </form>

        {results && (
          <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0' }}>
            {results.length === 0 && <p style={{ color: '#999' }}>No matches.</p>}
            {results.map((p) => (
              <li key={p.username} style={rowStyle}>
                <div>
                  <strong>{p.username}</strong>{' '}
                  <span style={{ color: '#999' }}>
                    — {p.rank} · 📍 {p.state} · ${p.cash.toLocaleString()} · {p.status}
                    {p.isAdmin ? ' · admin' : ''}
                  </span>
                </div>
                <button onClick={() => loadDetail(p.username)} style={smallButtonStyle}>View →</button>
              </li>
            ))}
          </ul>
        )}

        {detail && (
          <div style={{ ...cardStyle, marginTop: 20 }}>
            <h2 style={{ marginTop: 0 }}>
              {detail.username} {detail.isAdmin && <span style={{ color: '#f87171', fontSize: 13 }}>(admin)</span>}
            </h2>
            <p style={{ color: '#999', fontSize: 14 }}>
              {detail.rank} · 📍 {detail.state} · status: {detail.status}
            </p>
            <div style={statGridStyle}>
              <Stat label="Cash" value={`$${detail.cash.toLocaleString()}`} />
              <Stat label="Premium Points" value={detail.premiumPoints.toLocaleString()} />
              <Stat label="Mafia XP" value={detail.mafiaXp.toLocaleString()} />
              <Stat label="Bullets" value={detail.bullets.toLocaleString()} />
              <Stat label="Heat" value={`${detail.heat} / 100`} />
              <Stat label="Kills / Deaths" value={`${detail.stats.kills} / ${detail.stats.deaths}`} />
              <Stat label="Cash earned / spent / lost" value={`$${detail.stats.cashEarned.toLocaleString()} / $${detail.stats.cashSpent.toLocaleString()} / $${detail.stats.cashLost.toLocaleString()}`} />
              <Stat label="Times arrested" value={String(detail.stats.timesArrested)} />
            </div>

            {detail.status !== 'ALIVE' && (
              <p style={{ color: '#facc15', fontSize: 13, marginTop: 12 }}>
                Dead until: {detail.deadUntil ?? '—'} · Jail until: {detail.jailUntil ?? '—'} · Hospital until: {detail.hospitalUntil ?? '—'}
              </p>
            )}

            <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
              <div>
                <label style={labelStyle}>Grant / deduct cash</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="number"
                    value={cashAmount}
                    onChange={(e) => setCashAmount(e.target.value)}
                    placeholder="e.g. 50000 or -10000"
                    style={inputStyle}
                  />
                  <button onClick={grantCash} disabled={busy === 'cash'} style={smallButtonStyle}>
                    {busy === 'cash' ? '…' : 'Apply'}
                  </button>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Grant / deduct premium points</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="number"
                    value={pointsAmount}
                    onChange={(e) => setPointsAmount(e.target.value)}
                    placeholder="e.g. 50 or -10"
                    style={inputStyle}
                  />
                  <button onClick={grantPoints} disabled={busy === 'points'} style={smallButtonStyle}>
                    {busy === 'points' ? '…' : 'Apply'}
                  </button>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <button onClick={clearStatus} disabled={busy === 'clear' || detail.status === 'ALIVE'} style={busy === 'clear' || detail.status === 'ALIVE' ? smallButtonDisabledStyle : dangerSmallButtonStyle}>
                {busy === 'clear' ? '…' : detail.status === 'ALIVE' ? 'Already ALIVE' : `Clear status (currently ${detail.status})`}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#0d0d12', border: '1px solid #26262f', borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  );
}

const pageStyle: CSSProperties = { minHeight: '100vh', display: 'flex', justifyContent: 'center', padding: '48px 24px' };
const cardStyle: CSSProperties = { background: '#16161d', border: '1px solid #26262f', borderRadius: 8, padding: 16 };
const statGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginTop: 12 };
const rowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  background: '#16161d',
  border: '1px solid #26262f',
  borderRadius: 6,
  padding: '10px 14px',
  marginBottom: 8,
  fontSize: 14,
  flexWrap: 'wrap',
  gap: 8,
};
const inputStyle: CSSProperties = {
  flex: 1,
  padding: '8px 10px',
  background: '#0d0d12',
  border: '1px solid #333',
  borderRadius: 4,
  color: '#fff',
  fontSize: 13,
};
const labelStyle: CSSProperties = { display: 'block', fontSize: 12, color: '#999', marginBottom: 6 };
const buttonStyle: CSSProperties = {
  padding: '8px 14px',
  background: '#b91c1c',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: 13,
};
const smallButtonStyle: CSSProperties = {
  padding: '6px 10px',
  background: '#0d0d12',
  color: '#ccc',
  border: '1px solid #333',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 12,
  whiteSpace: 'nowrap',
};
const smallButtonDisabledStyle: CSSProperties = { ...smallButtonStyle, color: '#555', cursor: 'not-allowed' };
const dangerSmallButtonStyle: CSSProperties = { ...smallButtonStyle, color: '#f87171', borderColor: '#7f1d1d' };
const navLinkStyle: CSSProperties = {
  color: '#fff',
  fontSize: 14,
  textDecoration: 'none',
  border: '1px solid #333',
  borderRadius: 4,
  padding: '8px 14px',
  background: '#16161d',
  display: 'inline-block',
  marginTop: 16,
};
