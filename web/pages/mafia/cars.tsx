import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { apiFetch, getToken } from '../../lib/api';
import NavBar from '../../components/NavBar';

interface CatalogVehicle {
  name: string;
  rarity: string;
  value: number;
  theftDifficulty: number;
  bulletMeltValue: number;
  resaleValue: number;
  description: string | null;
}

interface OwnedVehicle {
  id: string;
  name: string;
  rarity: string;
  bulletMeltValue: number;
  resaleValue: number;
  acquiredAt: string;
}

const RARITY_COLOR: Record<string, string> = {
  Common: '#9ca3af',
  Uncommon: '#4ade80',
  Rare: '#60a5fa',
  Epic: '#c084fc',
  Legendary: '#facc15',
};

export default function CarsPage() {
  const router = useRouter();
  const [catalog, setCatalog] = useState<CatalogVehicle[]>([]);
  const [owned, setOwned] = useState<OwnedVehicle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    const [catalogRes, ownedRes] = await Promise.all([
      apiFetch<{ vehicles: CatalogVehicle[] }>('/api/v1/mafia/cars'),
      apiFetch<{ vehicles: OwnedVehicle[] }>('/api/v1/mafia/cars/mine'),
    ]);
    if (!catalogRes.ok || !catalogRes.data) {
      setError(catalogRes.error?.message ?? 'Could not load the vehicle catalog.');
      return;
    }
    setCatalog(catalogRes.data.vehicles);
    if (ownedRes.ok && ownedRes.data) setOwned(ownedRes.data.vehicles);
    setError(null);
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    loadAll();
  }, [router, loadAll]);

  async function dispose(id: string, action: 'sell' | 'melt') {
    setBusyId(id);
    setMessage(null);
    const res = await apiFetch<{ cashReceived?: number; bulletsGained?: number }>(`/api/v1/mafia/cars/${id}/${action}`, {
      method: 'POST',
    });
    setBusyId(null);
    if (!res.ok || !res.data) {
      setMessage(res.error?.message ?? `Could not ${action} that car.`);
      return;
    }
    setMessage(
      action === 'sell'
        ? `Sold for $${res.data.cashReceived?.toLocaleString()}.`
        : `Melted into ${res.data.bulletsGained?.toLocaleString()} bullets.`
    );
    await loadAll();
  }

  if (error) return <main style={pageStyle}><p>{error}</p></main>;

  return (
    <main style={pageStyle}>
      <div style={{ width: '100%', maxWidth: 820 }}>
        <NavBar />

        <h1 style={{ margin: '16px 0 4px' }}>Garage</h1>
        <p style={{ color: '#999', marginTop: 0 }}>
          A successful Grand Theft Auto has a chance of also handing you a vehicle — rarer ones
          are harder to steal and show up less often. Sell for cash or melt into bullets.
        </p>

        {message && <p style={{ color: '#4ade80', fontSize: 14 }}>{message}</p>}

        <h2 style={sectionHeadingStyle}>Your garage ({owned.length})</h2>
        {owned.length === 0 ? (
          <div style={cardStyle}>
            <p style={{ margin: 0, color: '#999', fontSize: 14 }}>
              Nothing here yet — keep trying your luck at{' '}
              <Link href="/mafia/crimes" style={{ color: '#fff' }}>
                Grand Theft Auto
              </Link>
              .
            </p>
          </div>
        ) : (
          <div style={shopGridStyle}>
            {owned.map((v) => (
              <div key={v.id} style={cardStyle}>
                <div style={{ fontWeight: 700 }}>{v.name}</div>
                <div style={{ fontSize: 12, color: RARITY_COLOR[v.rarity] ?? '#999', marginBottom: 6 }}>{v.rarity}</div>
                <div style={{ fontSize: 13, color: '#999' }}>Sell: ${v.resaleValue.toLocaleString()}</div>
                <div style={{ fontSize: 13, color: '#999', marginBottom: 10 }}>Melt: {v.bulletMeltValue.toLocaleString()} bullets</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => dispose(v.id, 'sell')}
                    disabled={busyId === v.id}
                    style={{ ...buttonStyle, flex: 1 }}
                  >
                    {busyId === v.id ? '…' : 'Sell'}
                  </button>
                  <button
                    onClick={() => dispose(v.id, 'melt')}
                    disabled={busyId === v.id}
                    style={{ ...buttonSecondaryStyle, flex: 1 }}
                  >
                    {busyId === v.id ? '…' : 'Melt'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <h2 style={sectionHeadingStyle}>All vehicles</h2>
        <div style={shopGridStyle}>
          {catalog.map((v) => (
            <div key={v.name} style={cardStyle}>
              <div style={{ fontWeight: 700 }}>{v.name}</div>
              <div style={{ fontSize: 12, color: RARITY_COLOR[v.rarity] ?? '#999', marginBottom: 6 }}>{v.rarity}</div>
              <div style={{ color: '#999', fontSize: 13, margin: '4px 0' }}>{v.description}</div>
              <div style={{ fontSize: 13, color: '#999' }}>Theft difficulty: {v.theftDifficulty}/100</div>
              <div style={{ fontSize: 13, color: '#999' }}>Value: ${v.value.toLocaleString()}</div>
              <div style={{ fontSize: 13, color: '#999' }}>Melts into: {v.bulletMeltValue.toLocaleString()} bullets</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

const pageStyle: CSSProperties = { minHeight: '100vh', display: 'flex', justifyContent: 'center', padding: '48px 24px' };
const cardStyle: CSSProperties = { background: '#16161d', border: '1px solid #26262f', borderRadius: 8, padding: 16 };
const sectionHeadingStyle: CSSProperties = { marginTop: 32, marginBottom: 12, fontSize: 18 };
const shopGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 };
const buttonStyle: CSSProperties = {
  padding: '8px 12px',
  background: '#b91c1c',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: 13,
};
const buttonSecondaryStyle: CSSProperties = {
  ...buttonStyle,
  background: '#333',
  color: '#fff',
};
