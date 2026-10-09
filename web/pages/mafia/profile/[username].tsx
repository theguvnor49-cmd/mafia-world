import { useEffect, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { apiFetch, getToken } from '../../../lib/api';
import StatusBadge from '../../../components/StatusBadge';

interface PlayerProfile {
  username: string;
  rank: string;
  mafiaXp: number;
  status: 'ALIVE' | 'DEAD' | 'JAIL' | 'HOSPITAL';
  state: string;
  cash: number;
  gang: string | null;
  stats: {
    crimesCommitted: number;
    crimesSucceeded: number;
    crimesFailed: number;
    kills: number;
    deaths: number;
    jailSecondsServed: number;
    timesArrested: number;
    successfulBusts: number;
    failedBusts: number;
  };
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function PlayerProfilePage() {
  const router = useRouter();
  const { username } = router.query;
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!username || typeof username !== 'string') return;
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    apiFetch<PlayerProfile>(`/api/v1/players/${encodeURIComponent(username)}`).then((res) => {
      if (!res.ok || !res.data) {
        setError(res.error?.message ?? 'Could not load that profile.');
        return;
      }
      setProfile(res.data);
    });
  }, [username, router]);

  if (error) return <main style={pageStyle}><p>{error}</p></main>;
  if (!profile) return <main style={pageStyle}><p>Loading…</p></main>;

  return (
    <main style={pageStyle}>
      <div style={{ width: '100%', maxWidth: 640 }}>
        <Link href="/mafia" style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>
          ← Back to dashboard
        </Link>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0 24px' }}>
          <div>
            <h1 style={{ margin: 0 }}>{profile.username}</h1>
            <p style={{ margin: '4px 0 0', color: '#999' }}>
              {profile.rank} · 📍 {profile.state}
            </p>
          </div>
          <StatusBadge status={profile.status} />
        </div>

        <div style={statGridStyle}>
          <Stat label="Cash" value={`$${profile.cash.toLocaleString()}`} />
          <Stat label="Mafia XP" value={profile.mafiaXp.toLocaleString()} />
          <Stat label="Gang" value={profile.gang ?? 'None'} />
          <Stat label="Kills" value={profile.stats.kills.toLocaleString()} />
          <Stat label="Deaths" value={profile.stats.deaths.toLocaleString()} />
          <Stat label="Crimes" value={profile.stats.crimesCommitted.toLocaleString()} />
          <Stat label="Successful Busts" value={profile.stats.successfulBusts.toLocaleString()} />
          <Stat label="Failed Busts" value={profile.stats.failedBusts.toLocaleString()} />
          <Stat label="Times Arrested" value={profile.stats.timesArrested.toLocaleString()} />
          <Stat label="Jail Time Served" value={formatDuration(profile.stats.jailSecondsServed)} />
        </div>
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
const statGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 };
