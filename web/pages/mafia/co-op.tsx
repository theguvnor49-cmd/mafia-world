import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/router';
import { apiFetch, getToken } from '../../lib/api';
import NavBar from '../../components/NavBar';

// Mirrors COOP.ROLES in server/src/mafia/config.ts — the brief's own
// example role list (section 27). Small, fixed, flavor-only catalog, so
// it's duplicated here rather than fetched, the same way cars.tsx already
// hardcodes its 5 rarity-tier names/colors client-side.
const ROLES = ['Driver', 'Gunman', 'Hacker', 'Lookout', 'Muscle', 'Boss'] as const;

interface Participant {
  username: string;
  role: string | null;
}

interface CoopJob {
  id: string;
  state: string;
  closesAt: string;
  secondsRemaining: number;
  rewardCash: number;
  rewardXp: number;
  playerCount: number;
  maxPlayers: number;
  full: boolean;
  participants: Participant[];
  joined: boolean;
  yourRole: string | null;
}

interface JustCompleted {
  cash: number;
  xp: number;
  role: string | null;
}

interface StatusResponse {
  job: CoopJob | null;
  justCompleted: JustCompleted | null;
}

/** h:mm:ss for up to the full 4-hour window — plain mm:ss (as jail uses)
 * would be ambiguous past an hour. Purely cosmetic client-side ticking;
 * the server's `closesAt` timestamp is what's actually authoritative. */
function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export default function CoopPage() {
  const router = useRouter();
  const [job, setJob] = useState<CoopJob | null>(null);
  const [justCompleted, setJustCompleted] = useState<JustCompleted | null>(null);
  const [myState, setMyState] = useState<string | null>(null);
  const [myStatus, setMyStatus] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const logId = useRef(0);

  const loadStatus = useCallback(async () => {
    const [statusRes, meRes] = await Promise.all([
      apiFetch<StatusResponse>('/api/v1/mafia/coop/status'),
      apiFetch<{ state: string; status: string }>('/api/v1/me'),
    ]);
    setLoaded(true);
    if (!statusRes.ok || !statusRes.data) {
      setError(statusRes.error?.message ?? 'Could not load the co-op job.');
      return;
    }
    setError(null);
    setJob(statusRes.data.job);
    setSecondsRemaining(statusRes.data.job?.secondsRemaining ?? 0);
    if (statusRes.data.justCompleted) {
      setJustCompleted(statusRes.data.justCompleted);
    }
    if (meRes.ok && meRes.data) {
      setMyState(meRes.data.state);
      setMyStatus(meRes.data.status);
    }
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    loadStatus();
  }, [router, loadStatus]);

  // Purely cosmetic client-side tick, same pattern as the dashboard's jail
  // countdown — counts down to the server's own closesAt, then re-fetches
  // to pick up resolution (and a possible justCompleted payout) or a fresh
  // job, whichever actually happened server-side.
  useEffect(() => {
    if (!job || secondsRemaining <= 0) return;
    const id = setInterval(() => {
      setSecondsRemaining((s) => {
        if (s <= 1) {
          loadStatus();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [job, secondsRemaining, loadStatus]);

  async function join() {
    setBusy(true);
    setError(null);
    const res = await apiFetch<{ role: string | null }>('/api/v1/mafia/coop/join', {
      method: 'POST',
      body: JSON.stringify(selectedRole ? { role: selectedRole } : {}),
    });
    setBusy(false);
    if (!res.ok || !res.data) {
      setError(res.error?.message ?? 'Could not join that job.');
      return;
    }
    logId.current += 1;
    await loadStatus();
  }

  if (!loaded) return <main style={pageStyle}><p>Loading…</p></main>;
  if (error && !job) return <main style={pageStyle}><p>{error}</p></main>;

  const canJoin =
    !!job && !job.joined && !job.full && myStatus === 'ALIVE' && myState === job.state && !busy;

  return (
    <main style={pageStyle}>
      <div style={{ width: '100%', maxWidth: 640 }}>
        <NavBar />

        <h1 style={{ margin: '16px 0 4px' }}>Co-op Heist</h1>
        <p style={{ color: '#999', marginTop: 0 }}>
          Up to 6 players, one job running at a time, a reward well above anything you&apos;d see
          solo. Everyone who&apos;s still in when the timer runs out gets paid in full — no
          success roll, no split pool.
        </p>

        {justCompleted && (
          <div style={payoutBannerStyle}>
            <span>
              💰 Your crew&apos;s job paid off — you earned ${justCompleted.cash.toLocaleString()} and{' '}
              {justCompleted.xp.toLocaleString()} XP
              {justCompleted.role ? ` as the ${justCompleted.role}` : ''}.
            </span>
            <button onClick={() => setJustCompleted(null)} style={dismissStyle}>
              Dismiss
            </button>
          </div>
        )}

        {error && <p style={{ color: '#f87171', fontSize: 14 }}>{error}</p>}

        {!job ? (
          <div style={cardStyle}>
            <p style={{ margin: 0, color: '#999', fontSize: 14 }}>
              No job running right now — check back shortly.
            </p>
          </div>
        ) : (
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>📍 {job.state}</h2>
              <span style={{ color: '#facc15', fontSize: 14 }}>Closes in {formatDuration(secondsRemaining)}</span>
            </div>

            <div style={statRowStyle}>
              <Stat label="Reward" value={`$${job.rewardCash.toLocaleString()}`} />
              <Stat label="Bonus XP" value={job.rewardXp.toLocaleString()} />
              <Stat label="Crew" value={`${job.playerCount} / ${job.maxPlayers}`} />
            </div>

            <h3 style={rosterHeadingStyle}>Crew</h3>
            {job.participants.length === 0 ? (
              <p style={{ color: '#999', fontSize: 14 }}>Nobody&apos;s joined yet — be the first.</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px' }}>
                {job.participants.map((p) => (
                  <li key={p.username} style={rosterRowStyle}>
                    <span>{p.username}</span>
                    <span style={{ color: '#999' }}>{p.role ?? 'No role'}</span>
                  </li>
                ))}
              </ul>
            )}

            {job.joined ? (
              <p style={{ color: '#4ade80', fontSize: 14 }}>
                You&apos;re in this one{job.yourRole ? ` as the ${job.yourRole}` : ''} — sit tight for the payout.
              </p>
            ) : (
              <>
                {myStatus !== 'ALIVE' && (
                  <p style={{ color: '#f87171', fontSize: 14 }}>
                    You can&apos;t join right now — you&apos;re {myStatus?.toLowerCase()}.
                  </p>
                )}
                {myStatus === 'ALIVE' && myState !== job.state && (
                  <p style={{ color: '#f87171', fontSize: 14 }}>You need to be in {job.state} to join this job.</p>
                )}
                {job.full && <p style={{ color: '#f87171', fontSize: 14 }}>This job&apos;s crew is already full.</p>}

                <div style={{ display: 'flex', gap: 8 }}>
                  <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)} style={selectStyle}>
                    <option value="">No role preference</option>
                    {ROLES.map((role) => {
                      const taken = job.participants.some((p) => p.role === role);
                      return (
                        <option key={role} value={role} disabled={taken}>
                          {role}
                          {taken ? ' (taken)' : ''}
                        </option>
                      );
                    })}
                  </select>
                  <button onClick={join} disabled={!canJoin} style={canJoin ? buttonStyle : buttonDisabledStyle}>
                    {busy ? 'Joining…' : 'Join job'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#0d0d12', border: '1px solid #26262f', borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 12, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  );
}

const pageStyle: CSSProperties = { minHeight: '100vh', display: 'flex', justifyContent: 'center', padding: '48px 24px' };
const cardStyle: CSSProperties = { background: '#16161d', border: '1px solid #26262f', borderRadius: 8, padding: 20 };
const statRowStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, margin: '16px 0' };
const rosterHeadingStyle: CSSProperties = { fontSize: 14, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' };
const rosterRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '8px 10px',
  background: '#0d0d12',
  border: '1px solid #26262f',
  borderRadius: 6,
  marginBottom: 6,
  fontSize: 14,
};
const selectStyle: CSSProperties = {
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
const payoutBannerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  background: '#14281b',
  border: '1px solid #4ade80',
  borderRadius: 8,
  padding: '12px 16px',
  marginBottom: 16,
  fontSize: 14,
  color: '#4ade80',
  flexWrap: 'wrap',
};
const dismissStyle: CSSProperties = {
  background: 'transparent',
  border: '1px solid #4ade80',
  color: '#4ade80',
  padding: '4px 10px',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 12,
};
