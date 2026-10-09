import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { apiFetch, getToken } from '../../../lib/api';

// Mirrors GANGS in server/src/mafia/config.ts.
const TERRITORY_CLAIM_COST = 500_000;

type GangRank = 'Boss' | 'Underboss' | 'Capo' | 'Soldier' | 'Associate';

interface MeData {
  username: string;
  cash: number;
  state: string;
  gang: { name: string; rank: GangRank } | null;
}

interface GangMember {
  username: string;
  rank: GangRank;
  joinedAt: string;
}

interface GangDetail {
  name: string;
  treasury: number;
  territoryState: string | null;
  reputation: number;
  disbanded: boolean;
  memberCount: number;
  totalKills: number;
  members: GangMember[];
}

export default function GangDetailPage() {
  const router = useRouter();
  const name = typeof router.query.name === 'string' ? router.query.name : null;

  const [me, setMe] = useState<MeData | null>(null);
  const [gang, setGang] = useState<GangDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [busy, setBusy] = useState<string | null>(null); // which action is in flight
  const [depositAmount, setDepositAmount] = useState('10000');
  const [withdrawAmount, setWithdrawAmount] = useState('10000');
  const [confirmingDisband, setConfirmingDisband] = useState(false);
  const [memberActionBusy, setMemberActionBusy] = useState<string | null>(null); // username being acted on

  const load = useCallback(async () => {
    if (!name) return;
    const [meRes, gangRes] = await Promise.all([
      apiFetch<MeData>('/api/v1/me'),
      apiFetch<GangDetail>(`/api/v1/mafia/gangs/${encodeURIComponent(name)}`),
    ]);
    if (meRes.ok && meRes.data) setMe(meRes.data);
    if (gangRes.ok && gangRes.data) {
      setGang(gangRes.data);
      setNotFound(false);
    } else {
      setNotFound(true);
    }
  }, [name]);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    load();
  }, [router, load]);

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

  async function join() {
    if (!name) return;
    const result = await runAction('join', `/api/v1/mafia/gangs/${encodeURIComponent(name)}/join`);
    if (result) {
      setMessage(`You joined ${name}.`);
      await load();
    }
  }

  async function leave() {
    if (!name) return;
    const result = await runAction('leave', `/api/v1/mafia/gangs/${encodeURIComponent(name)}/leave`);
    if (result) {
      setMessage(`You left ${name}.`);
      await load();
    }
  }

  async function deposit() {
    if (!name) return;
    const amount = Number(depositAmount);
    if (!Number.isInteger(amount) || amount <= 0) {
      setError('Enter a positive whole-number amount to deposit.');
      return;
    }
    const result = await runAction('deposit', `/api/v1/mafia/gangs/${encodeURIComponent(name)}/deposit`, { amount });
    if (result) {
      setMessage(`Deposited $${amount.toLocaleString()} into the treasury.`);
      await load();
    }
  }

  async function withdraw() {
    if (!name) return;
    const amount = Number(withdrawAmount);
    if (!Number.isInteger(amount) || amount <= 0) {
      setError('Enter a positive whole-number amount to withdraw.');
      return;
    }
    const result = await runAction('withdraw', `/api/v1/mafia/gangs/${encodeURIComponent(name)}/withdraw`, { amount });
    if (result) {
      setMessage(`Withdrew $${amount.toLocaleString()} from the treasury.`);
      await load();
    }
  }

  async function claimTerritory() {
    if (!name) return;
    const result = await runAction<{ territoryState: string }>('claim', `/api/v1/mafia/gangs/${encodeURIComponent(name)}/claim-territory`);
    if (result) {
      setMessage(`${name} now holds ${result.territoryState}.`);
      await load();
    }
  }

  async function disband() {
    if (!name) return;
    const result = await runAction('disband', `/api/v1/mafia/gangs/${encodeURIComponent(name)}/disband`);
    if (result) {
      setMessage(`${name} has been disbanded.`);
      setConfirmingDisband(false);
      await load();
    }
  }

  async function kick(username: string) {
    if (!name) return;
    setMemberActionBusy(username);
    const result = await runAction('kick', `/api/v1/mafia/gangs/${encodeURIComponent(name)}/kick`, { username });
    setMemberActionBusy(null);
    if (result) {
      setMessage(`Kicked ${username}.`);
      await load();
    }
  }

  async function promote(username: string) {
    if (!name) return;
    setMemberActionBusy(username);
    const result = await runAction<{ newRank: GangRank }>('promote', `/api/v1/mafia/gangs/${encodeURIComponent(name)}/promote`, { username });
    setMemberActionBusy(null);
    if (result) {
      setMessage(`${username} promoted to ${result.newRank}.`);
      await load();
    }
  }

  async function demote(username: string) {
    if (!name) return;
    setMemberActionBusy(username);
    const result = await runAction<{ newRank: GangRank }>('demote', `/api/v1/mafia/gangs/${encodeURIComponent(name)}/demote`, { username });
    setMemberActionBusy(null);
    if (result) {
      setMessage(`${username} demoted to ${result.newRank}.`);
      await load();
    }
  }

  if (notFound) return <main style={pageStyle}><p>No gang with that name.</p></main>;
  if (!gang || !me) return <main style={pageStyle}><p>Loading…</p></main>;

  const myRank = me.gang?.name === gang.name ? me.gang.rank : null;
  const isMember = myRank !== null;
  const isBoss = myRank === 'Boss';
  const canJoin = !gang.disbanded && !me.gang;

  return (
    <main style={pageStyle}>
      <div style={{ width: '100%', maxWidth: 640 }}>
        <Link href="/mafia/gangs" style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>
          ← All gangs
        </Link>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 16 }}>
          <h1 style={{ margin: 0 }}>{gang.name}</h1>
          {gang.disbanded && <span style={disbandedBadgeStyle}>DISBANDED</span>}
        </div>

        {message && <p style={{ color: '#4ade80', fontSize: 14 }}>{message}</p>}
        {error && <p style={{ color: '#f87171', fontSize: 14 }}>{error}</p>}

        <div style={statGridStyle}>
          <Stat label="Treasury" value={`$${gang.treasury.toLocaleString()}`} />
          <Stat label="Reputation" value={String(gang.reputation)} />
          <Stat label="Territory" value={gang.territoryState ?? 'None'} />
          <Stat label="Members" value={String(gang.memberCount)} />
          <Stat label="Combined kills" value={String(gang.totalKills)} />
        </div>

        {canJoin && (
          <button onClick={join} disabled={busy === 'join'} style={busy === 'join' ? buttonDisabledStyle : buttonStyle}>
            {busy === 'join' ? 'Joining…' : 'Join this gang'}
          </button>
        )}
        {!gang.disbanded && me.gang && me.gang.name !== gang.name && (
          <p style={{ color: '#999', fontSize: 14 }}>You&apos;re already in {me.gang.name} — leave it first to join here.</p>
        )}

        {isMember && !gang.disbanded && (
          <>
            <h2 style={sectionHeadingStyle}>Treasury</h2>
            <div style={actionGridStyle}>
              <div style={cardStyle}>
                <p style={activityCopyStyle}>Deposit your own cash into the gang treasury.</p>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} min={1} style={inputStyle} />
                  <button onClick={deposit} disabled={busy === 'deposit'} style={busy === 'deposit' ? buttonDisabledStyle : buttonStyle}>
                    {busy === 'deposit' ? '…' : 'Deposit'}
                  </button>
                </div>
              </div>
              {isBoss && (
                <div style={cardStyle}>
                  <p style={activityCopyStyle}>Withdraw from the treasury (Boss only).</p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="number" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} min={1} style={inputStyle} />
                    <button onClick={withdraw} disabled={busy === 'withdraw'} style={busy === 'withdraw' ? buttonDisabledStyle : buttonStyle}>
                      {busy === 'withdraw' ? '…' : 'Withdraw'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {isBoss && (
              <>
                <h2 style={sectionHeadingStyle}>Territory</h2>
                <div style={cardStyle}>
                  <p style={activityCopyStyle}>
                    Claim whatever state you&apos;re currently in ({me.state}) for ${TERRITORY_CLAIM_COST.toLocaleString()} from the treasury.
                    {gang.territoryState ? ` Currently holding ${gang.territoryState}.` : ' Not holding any state yet.'}
                  </p>
                  <button onClick={claimTerritory} disabled={busy === 'claim' || gang.territoryState === me.state} style={busy === 'claim' || gang.territoryState === me.state ? buttonDisabledStyle : buttonStyle}>
                    {busy === 'claim' ? 'Claiming…' : gang.territoryState === me.state ? `Already hold ${me.state}` : `Claim ${me.state}`}
                  </button>
                </div>
              </>
            )}

            <h2 style={sectionHeadingStyle}>Members</h2>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {gang.members.map((m) => (
                <li key={m.username} style={memberRowStyle}>
                  <span>
                    <strong>{m.username}</strong> <span style={{ color: '#999' }}>— {m.rank}</span>
                  </span>
                  {isBoss && m.username !== me.username && (
                    <span style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => promote(m.username)} disabled={memberActionBusy === m.username} style={smallButtonStyle}>
                        Promote
                      </button>
                      <button onClick={() => demote(m.username)} disabled={memberActionBusy === m.username} style={smallButtonStyle}>
                        Demote
                      </button>
                      <button onClick={() => kick(m.username)} disabled={memberActionBusy === m.username} style={{ ...smallButtonStyle, color: '#f87171' }}>
                        Kick
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>

            <div style={{ marginTop: 20 }}>
              {!isBoss ? (
                <button onClick={leave} disabled={busy === 'leave'} style={busy === 'leave' ? buttonDisabledStyle : dangerButtonStyle}>
                  {busy === 'leave' ? 'Leaving…' : 'Leave gang'}
                </button>
              ) : !confirmingDisband ? (
                <button onClick={() => setConfirmingDisband(true)} style={dangerButtonStyle}>
                  Disband gang
                </button>
              ) : (
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ color: '#f87171', fontSize: 13 }}>Disbanding frees every member and can&apos;t be undone.</span>
                  <button onClick={disband} disabled={busy === 'disband'} style={dangerButtonStyle}>
                    {busy === 'disband' ? 'Disbanding…' : 'Confirm disband'}
                  </button>
                  <button onClick={() => setConfirmingDisband(false)} style={smallButtonStyle}>
                    Cancel
                  </button>
                </span>
              )}
            </div>
          </>
        )}

        {!isMember && (
          <>
            <h2 style={sectionHeadingStyle}>Members</h2>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {gang.members.map((m) => (
                <li key={m.username} style={memberRowStyle}>
                  <strong>{m.username}</strong> <span style={{ color: '#999' }}>— {m.rank}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#16161d', border: '1px solid #26262f', borderRadius: 8, padding: 14 }}>
      <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  );
}

const pageStyle: CSSProperties = { minHeight: '100vh', display: 'flex', justifyContent: 'center', padding: '48px 24px' };
const cardStyle: CSSProperties = { background: '#16161d', border: '1px solid #26262f', borderRadius: 8, padding: 16 };
const statGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, margin: '16px 0' };
const actionGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 };
const sectionHeadingStyle: CSSProperties = { marginTop: 24, marginBottom: 12, fontSize: 16, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em' };
const activityCopyStyle: CSSProperties = { color: '#999', fontSize: 13, margin: '0 0 12px' };
const memberRowStyle: CSSProperties = {
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
const disbandedBadgeStyle: CSSProperties = {
  background: '#333',
  color: '#999',
  fontSize: 12,
  fontWeight: 700,
  padding: '4px 10px',
  borderRadius: 4,
  letterSpacing: '0.05em',
};
const inputStyle: CSSProperties = {
  flex: 1,
  background: '#0d0d12',
  border: '1px solid #333',
  color: '#fff',
  padding: '10px 12px',
  borderRadius: 4,
  fontSize: 14,
  width: 0,
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
const dangerButtonStyle: CSSProperties = {
  padding: '8px 14px',
  background: 'transparent',
  color: '#f87171',
  border: '1px solid #7f1d1d',
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
};
