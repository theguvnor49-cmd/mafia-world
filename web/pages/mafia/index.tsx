import { useCallback, useEffect, useState, type CSSProperties } from 'react';
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
  equippedGun: { name: string; bulletMultiplier: number } | null;
  equippedArmour: { name: string; bonusBullets: number; multiplier: number } | null;
  heat: number;
  status: 'ALIVE' | 'DEAD' | 'JAIL' | 'HOSPITAL';
  deadUntil: string | null;
  jailUntil: string | null;
}

/** mm:ss — matches the brief's own jail mockup ("Time remaining: 01:12"),
 * unlike the dead/hospital timers which are long enough to show as a date
 * instead (see revive.tsx). */
function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function Dashboard() {
  const router = useRouter();
  const [me, setMe] = useState<MeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jailCountdown, setJailCountdown] = useState(0);

  const loadMe = useCallback(async () => {
    const res = await apiFetch<MeData>('/api/v1/me');
    if (!res.ok || !res.data) {
      clearToken();
      setError('Session expired — redirecting to login…');
      router.replace('/login');
      return;
    }
    setMe(res.data);
    setJailCountdown(
      res.data.jailUntil ? Math.max(0, Math.ceil((new Date(res.data.jailUntil).getTime() - Date.now()) / 1000)) : 0
    );
  }, [router]);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    loadMe();
  }, [router, loadMe]);

  // Purely cosmetic client-side tick — the server timestamp (jailUntil) is
  // what's authoritative; this just counts down to it, then re-fetches to
  // confirm (same pattern as crimes.tsx's cooldown and hunt.tsx's search).
  useEffect(() => {
    if (jailCountdown <= 0) return;
    const id = setInterval(() => {
      setJailCountdown((c) => {
        if (c <= 1) {
          loadMe();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [jailCountdown, loadMe]);

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

        {me.status === 'DEAD' && (
          <div style={deadBannerStyle}>
            <span>
              🔴 You&apos;re dead{me.deadUntil ? ` until ${new Date(me.deadUntil).toLocaleString()}` : ''}.
            </span>
            <Link href="/mafia/revive" style={{ color: '#fff', fontWeight: 600, textDecoration: 'underline' }}>
              Revive
            </Link>
          </div>
        )}

        {me.status === 'JAIL' && (
          <div style={jailBannerStyle}>
            <span>🚔 IN JAIL — Time remaining: {formatCountdown(jailCountdown)}</span>
            <span style={{ color: '#ca8a04' }}>Ask another player in {me.state} to bust you out.</span>
          </div>
        )}

        <div style={statGridStyle}>
          <Stat label="Cash" value={`$${me.cash.toLocaleString()}`} />
          <Stat label="Premium Points" value={me.premium_points.toLocaleString()} />
          <Stat label="Mafia XP" value={me.mafia_xp.toLocaleString()} />
          <Stat label="Bullets" value={me.bullets.toLocaleString()} />
          <Stat label="Heat" value={`${me.heat} / 100`} />
          <Stat label="Gun" value={me.equippedGun ? `${me.equippedGun.name} (${me.equippedGun.bulletMultiplier.toFixed(2)}x)` : 'None'} />
          <Stat
            label="Armour"
            value={me.equippedArmour ? `${me.equippedArmour.name} (+${me.equippedArmour.bonusBullets})` : 'None'}
          />
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
          <Link href={`/mafia/profile/${me.username}`} style={navLinkStyle}>
            View full profile →
          </Link>
          <Link href="/mafia/crimes" style={navLinkStyle}>
            Crimes →
          </Link>
          <Link href="/mafia/armoury" style={navLinkStyle}>
            Armoury →
          </Link>
          <Link href="/mafia/hunt" style={navLinkStyle}>
            Hunt →
          </Link>
          <Link href="/mafia/witness" style={navLinkStyle}>
            Witness statements →
          </Link>
          <Link href="/mafia/bust" style={navLinkStyle}>
            Jail bust-out →
          </Link>
          <Link href="/mafia/cars" style={navLinkStyle}>
            Garage →
          </Link>
        </div>

        <p style={{ marginTop: 20, color: '#666', fontSize: 13 }}>
          Gangs and everything else in the brief land in later phases — this dashboard will grow
          with them.
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
const deadBannerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  background: '#7f1d1d',
  border: '1px solid #b91c1c',
  borderRadius: 8,
  padding: '12px 16px',
  marginBottom: 20,
  fontSize: 14,
};
const jailBannerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  background: '#26220f',
  border: '1px solid #facc15',
  borderRadius: 8,
  padding: '12px 16px',
  marginBottom: 20,
  fontSize: 14,
  color: '#facc15',
  flexWrap: 'wrap',
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
