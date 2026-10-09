import { useEffect, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { apiFetch, clearToken, getToken } from '../../lib/api';
import StatusBadge from '../../components/StatusBadge';

interface MeData {
  username: string;
  state: string;
  cash: number;
  premium_points: number;
  mafia_xp: number;
  rank: string;
  bullets: number;
  heat: number;
  status: 'ALIVE' | 'DEAD' | 'JAIL' | 'HOSPITAL';
}

export default function Dashboard() {
  const router = useRouter();
  const [me, setMe] = useState<MeData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    apiFetch<MeData>('/api/v1/me').then((res) => {
      if (!res.ok || !res.data) {
        clearToken();
        setError('Session expired — redirecting to login…');
        router.replace('/login');
        return;
      }
      setMe(res.data);
    });
  }, [router]);

  if (error) return <main style={pageStyle}><p>{error}</p></main>;
  if (!me) return <main style={pageStyle}><p>Loading…</p></main>;

  return (
    <main style={pageStyle}>
      <div style={{ width: '100%', maxWidth: 640 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0 }}>{me.username}</h1>
            <p style={{ margin: '4px 0 0', color: '#999' }}>
              {me.rank} · 📍 {me.state}
            </p>
          </div>
          <StatusBadge status={me.status} />
        </div>

        <div style={statGridStyle}>
          <Stat label="Cash" value={`$${me.cash.toLocaleString()}`} />
          <Stat label="Premium Points" value={me.premium_points.toLocaleString()} />
          <Stat label="Mafia XP" value={me.mafia_xp.toLocaleString()} />
          <Stat label="Bullets" value={me.bullets.toLocaleString()} />
          <Stat label="Heat" value={`${me.heat} / 100`} />
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
          <Link href={`/mafia/profile/${me.username}`} style={navLinkStyle}>
            View full profile →
          </Link>
          <Link href="/mafia/crimes" style={navLinkStyle}>
            Crimes →
          </Link>
        </div>

        <p style={{ marginTop: 20, color: '#666', fontSize: 13 }}>
          Hunting, guns, armour, gangs and everything else in the brief land in later phases —
          this dashboard will grow with them.
        </p>

        <button onClick={() => { clearToken(); router.push('/'); }} style={logoutStyle}>
          Log out
        </button>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#16161d', border: '1px solid #26262f', borderRadius: 8, padding: 16 }}>
      <div style={{ fontSize: 12, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  );
}

const pageStyle: CSSProperties = { minHeight: '100vh', display: 'flex', justifyContent: 'center', padding: '48px 24px' };
const statGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 };
const logoutStyle: CSSProperties = {
  marginTop: 24,
  background: 'transparent',
  border: '1px solid #333',
  color: '#999',
  padding: '8px 16px',
  borderRadius: 4,
  cursor: 'pointer',
};
const navLinkStyle: CSSProperties = {
  color: '#fff',
  fontSize: 14,
  textDecoration: 'none',
  border: '1px solid #333',
  borderRadius: 4,
  padding: '8px 14px',
  background: '#16161d',
};
