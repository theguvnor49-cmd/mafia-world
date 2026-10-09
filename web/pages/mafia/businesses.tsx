import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/router';
import { apiFetch, getToken } from '../../lib/api';
import NavBar from '../../components/NavBar';

interface MeData {
  username: string;
  state: string;
  cash: number;
}

interface TypeDef {
  type: string;
  basePrice: number;
  baseIncomePerHour: number;
}

interface TypesResponse {
  maxLevel: number;
  types: TypeDef[];
}

interface OwnedBusiness {
  id: string;
  type: string;
  state: string;
  level: number;
  incomePerHour: number;
  accruedCash: number;
  upgradeCost: number | null;
  maxLevel: boolean;
}

interface DirectoryEntry {
  id: string;
  ownerUsername: string | null;
  type: string;
  state: string;
  level: number;
  incomePerHour: number;
  accruedCash: number;
}

export default function BusinessesPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeData | null>(null);
  const [catalog, setCatalog] = useState<TypesResponse | null>(null);
  const [mine, setMine] = useState<OwnedBusiness[] | null>(null);
  const [directory, setDirectory] = useState<DirectoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [meRes, catalogRes, mineRes, dirRes] = await Promise.all([
      apiFetch<MeData>('/api/v1/me'),
      apiFetch<TypesResponse>('/api/v1/mafia/businesses/types'),
      apiFetch<OwnedBusiness[]>('/api/v1/mafia/businesses/mine'),
      apiFetch<DirectoryEntry[]>('/api/v1/mafia/businesses'),
    ]);
    if (meRes.ok && meRes.data) setMe(meRes.data);
    if (catalogRes.ok && catalogRes.data) setCatalog(catalogRes.data);
    if (mineRes.ok && mineRes.data) setMine(mineRes.data);
    if (dirRes.ok && dirRes.data) setDirectory(dirRes.data);
  }, []);

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

  async function buy(type: string) {
    const result = await runAction<{ id: string }>(`buy:${type}`, '/api/v1/mafia/businesses/buy', { type });
    if (result) {
      setMessage(`Bought a ${type}.`);
      await load();
    }
  }

  async function upgrade(id: string, type: string) {
    const result = await runAction<{ newLevel: number }>(`upgrade:${id}`, `/api/v1/mafia/businesses/${id}/upgrade`);
    if (result) {
      setMessage(`${type} upgraded to level ${result.newLevel}.`);
      await load();
    }
  }

  async function collect(id: string, type: string) {
    const result = await runAction<{ collected: number }>(`collect:${id}`, `/api/v1/mafia/businesses/${id}/collect`);
    if (result) {
      setMessage(`Collected $${result.collected.toLocaleString()} from your ${type}.`);
      await load();
    }
  }

  async function rob(id: string, type: string) {
    const result = await runAction<{ success: boolean; cashStolen: number; jailSeconds: number }>(
      `rob:${id}`,
      `/api/v1/mafia/businesses/${id}/rob`
    );
    if (result) {
      setMessage(
        result.success
          ? `Robbed $${result.cashStolen.toLocaleString()} from that ${type}.`
          : `Caught red-handed — ${result.jailSeconds}s in jail.`
      );
      await load();
    }
  }

  async function seize(id: string, type: string) {
    const result = await runAction(`seize:${id}`, `/api/v1/mafia/businesses/${id}/seize`);
    if (result) {
      setMessage(`Seized an abandoned ${type}.`);
      await load();
    }
  }

  if (!me || !catalog || !mine || !directory) return <main style={pageStyle}><p>Loading…</p></main>;

  const ownedTypes = new Set(mine.map((b) => b.type));

  return (
    <main style={pageStyle}>
      <div style={{ width: '100%', maxWidth: 680 }}>
        <NavBar />

        <h1 style={{ margin: '16px 0 4px' }}>Businesses</h1>
        <p style={{ color: '#999', marginTop: 0 }}>
          One of each type, max level {catalog.maxLevel}. Every business earns cash on its own clock whether you&apos;re
          watching or not — collect it, or risk it getting robbed before you do.
        </p>

        {message && <p style={{ color: '#4ade80', fontSize: 14 }}>{message}</p>}
        {error && <p style={{ color: '#f87171', fontSize: 14 }}>{error}</p>}

        <h2 style={sectionHeadingStyle}>Buy a business</h2>
        <div style={gridStyle}>
          {catalog.types.map((t) => {
            const owned = ownedTypes.has(t.type);
            const afford = me.cash >= t.basePrice;
            const disabled = owned || !afford || busy === `buy:${t.type}`;
            return (
              <div key={t.type} style={cardStyle}>
                <div style={{ fontWeight: 600 }}>{t.type}</div>
                <div style={activityCopyStyle}>
                  ${t.basePrice.toLocaleString()} · ${t.baseIncomePerHour.toLocaleString()}/hr at level 1
                </div>
                <button onClick={() => buy(t.type)} disabled={disabled} style={disabled ? buttonDisabledStyle : buttonStyle}>
                  {owned ? 'Already own one' : busy === `buy:${t.type}` ? 'Buying…' : !afford ? "Can't afford" : 'Buy'}
                </button>
              </div>
            );
          })}
        </div>

        <h2 style={sectionHeadingStyle}>My businesses</h2>
        {mine.length === 0 ? (
          <p style={{ color: '#999' }}>You don&apos;t own any businesses yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {mine.map((b) => (
              <li key={b.id} style={rowStyle}>
                <div>
                  <strong>{b.type}</strong>{' '}
                  <span style={{ color: '#999' }}>
                    — level {b.level}
                    {b.maxLevel ? ' (max)' : ''} · 📍 {b.state} · ${b.incomePerHour.toLocaleString()}/hr
                  </span>
                  <div style={{ color: '#4ade80', fontSize: 13 }}>${b.accruedCash.toLocaleString()} ready to collect</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => collect(b.id, b.type)} disabled={busy === `collect:${b.id}`} style={smallButtonStyle}>
                    {busy === `collect:${b.id}` ? '…' : 'Collect'}
                  </button>
                  {!b.maxLevel && b.upgradeCost !== null && (
                    <button onClick={() => upgrade(b.id, b.type)} disabled={busy === `upgrade:${b.id}` || me.cash < b.upgradeCost} style={busy === `upgrade:${b.id}` || me.cash < b.upgradeCost ? smallButtonDisabledStyle : smallButtonStyle}>
                      {busy === `upgrade:${b.id}` ? '…' : `Upgrade ($${b.upgradeCost.toLocaleString()})`}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <h2 style={sectionHeadingStyle}>All businesses</h2>
        <p style={activityCopyStyle}>
          Rob one owned by someone else, or seize one that&apos;s been abandoned since its owner died — both require
          being in the same state as the business ({me.state} right now).
        </p>
        {directory.length === 0 ? (
          <p style={{ color: '#999' }}>No businesses exist yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {directory.map((b) => {
              const isMine = b.ownerUsername === me.username;
              const sameState = b.state === me.state;
              const actionKey = b.ownerUsername ? `rob:${b.id}` : `seize:${b.id}`;
              return (
                <li key={b.id} style={rowStyle}>
                  <div>
                    <strong>{b.type}</strong>{' '}
                    <span style={{ color: '#999' }}>
                      — level {b.level} · 📍 {b.state} ·{' '}
                      {b.ownerUsername ? (isMine ? 'owned by you' : `owned by ${b.ownerUsername}`) : 'unowned'}
                    </span>
                    <div style={{ color: '#999', fontSize: 13 }}>${b.accruedCash.toLocaleString()} sitting in the till</div>
                  </div>
                  {!isMine &&
                    (b.ownerUsername ? (
                      <button
                        onClick={() => rob(b.id, b.type)}
                        disabled={!sameState || busy === actionKey}
                        style={!sameState || busy === actionKey ? smallButtonDisabledStyle : dangerSmallButtonStyle}
                      >
                        {busy === actionKey ? '…' : sameState ? 'Rob' : `Be in ${b.state}`}
                      </button>
                    ) : (
                      <button
                        onClick={() => seize(b.id, b.type)}
                        disabled={!sameState || busy === actionKey}
                        style={!sameState || busy === actionKey ? smallButtonDisabledStyle : smallButtonStyle}
                      >
                        {busy === actionKey ? '…' : sameState ? 'Seize' : `Be in ${b.state}`}
                      </button>
                    ))}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}

const pageStyle: CSSProperties = { minHeight: '100vh', display: 'flex', justifyContent: 'center', padding: '48px 24px' };
const cardStyle: CSSProperties = { background: '#16161d', border: '1px solid #26262f', borderRadius: 8, padding: 14 };
const gridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 };
const sectionHeadingStyle: CSSProperties = { marginTop: 28, marginBottom: 12, fontSize: 16, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em' };
const activityCopyStyle: CSSProperties = { color: '#999', fontSize: 13, margin: '0 0 12px' };
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
const buttonStyle: CSSProperties = {
  marginTop: 10,
  padding: '8px 14px',
  background: '#b91c1c',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: 13,
  width: '100%',
};
const buttonDisabledStyle: CSSProperties = { ...buttonStyle, background: '#333', color: '#777', cursor: 'not-allowed' };
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
