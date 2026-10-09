import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { apiFetch, getToken } from '../../../lib/api';

// Mirrors GANGS in server/src/mafia/config.ts.
const CREATION_COST = 100_000;
const MAX_GANGS = 10;

interface MeData {
  gang: { name: string; rank: string } | null;
}

interface GangListEntry {
  name: string;
  treasury: number;
  territoryState: string | null;
  reputation: number;
  memberCount: number;
  totalKills: number;
}

export default function GangsDirectoryPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeData | null>(null);
  const [gangs, setGangs] = useState<GangListEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [meRes, gangsRes] = await Promise.all([
      apiFetch<MeData>('/api/v1/me'),
      apiFetch<GangListEntry[]>('/api/v1/mafia/gangs'),
    ]);
    if (meRes.ok && meRes.data) setMe(meRes.data);
    if (gangsRes.ok && gangsRes.data) setGangs(gangsRes.data);
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    load();
  }, [router, load]);

  async function createGang(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await apiFetch<{ name: string }>('/api/v1/mafia/gangs', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    setBusy(false);
    if (!res.ok || !res.data) {
      setError(res.error?.message ?? 'Could not create that gang.');
      return;
    }
    router.push(`/mafia/gangs/${encodeURIComponent(res.data.name)}`);
  }

  return (
    <main style={pageStyle}>
      <div style={{ width: '100%', maxWidth: 640 }}>
        <Link href="/mafia" style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>
          ← Back to dashboard
        </Link>

        <h1 style={{ margin: '16px 0 4px' }}>Gangs</h1>
        <p style={{ color: '#999', marginTop: 0 }}>
          Up to {MAX_GANGS} gangs at a time. Open join, Boss-run — see a gang for its roster and your options.
        </p>

        {error && <p style={{ color: '#f87171', fontSize: 14 }}>{error}</p>}

        {me && (
          me.gang ? (
            <div style={cardStyle}>
              <p style={{ margin: 0 }}>
                You&apos;re in <strong>{me.gang.name}</strong> as <strong>{me.gang.rank}</strong>.
              </p>
              <Link href={`/mafia/gangs/${encodeURIComponent(me.gang.name)}`} style={{ color: '#f87171', fontSize: 14 }}>
                View your gang →
              </Link>
            </div>
          ) : (
            <form onSubmit={createGang} style={cardStyle}>
              <h3 style={{ margin: '0 0 6px', fontSize: 15 }}>Start a gang</h3>
              <p style={activityCopyStyle}>Costs ${CREATION_COST.toLocaleString()} from your own cash. You become Boss.</p>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Gang name"
                  minLength={3}
                  maxLength={30}
                  style={inputStyle}
                />
                <button type="submit" disabled={busy || name.trim().length < 3} style={busy || name.trim().length < 3 ? buttonDisabledStyle : buttonStyle}>
                  {busy ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          )
        )}

        <h2 style={sectionHeadingStyle}>Active gangs</h2>
        {!gangs ? (
          <p style={{ color: '#999' }}>Loading…</p>
        ) : gangs.length === 0 ? (
          <p style={{ color: '#999' }}>No gangs exist yet — be the first.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {gangs.map((g) => (
              <li key={g.name} style={gangRowStyle}>
                <Link href={`/mafia/gangs/${encodeURIComponent(g.name)}`} style={{ color: '#fff', fontWeight: 600, textDecoration: 'none', fontSize: 15 }}>
                  {g.name}
                </Link>
                <div style={{ display: 'flex', gap: 16, marginTop: 6, color: '#999', fontSize: 13, flexWrap: 'wrap' }}>
                  <span>{g.memberCount} members</span>
                  <span>${g.treasury.toLocaleString()} treasury</span>
                  <span>{g.reputation} reputation</span>
                  <span>{g.territoryState ? `📍 ${g.territoryState}` : 'No territory'}</span>
                  <span>{g.totalKills} combined kills</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

const pageStyle: CSSProperties = { minHeight: '100vh', display: 'flex', justifyContent: 'center', padding: '48px 24px' };
const cardStyle: CSSProperties = { background: '#16161d', border: '1px solid #26262f', borderRadius: 8, padding: 16, marginTop: 16 };
const sectionHeadingStyle: CSSProperties = { marginTop: 24, marginBottom: 12, fontSize: 16, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em' };
const activityCopyStyle: CSSProperties = { color: '#999', fontSize: 13, margin: '0 0 12px' };
const gangRowStyle: CSSProperties = { background: '#16161d', border: '1px solid #26262f', borderRadius: 8, padding: 14, marginBottom: 10 };
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
  padding: '10px 16px',
  background: '#b91c1c',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: 13,
  whiteSpace: 'nowrap',
};
const buttonDisabledStyle: CSSProperties = {
  ...buttonStyle,
  background: '#333',
  color: '#777',
  cursor: 'not-allowed',
};
