import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/router';
import { apiFetch, getToken } from '../../lib/api';
import NavBar from '../../components/NavBar';

interface WitnessStatement {
  id: string;
  victimUsername: string;
  killerUsername: string;
  state: string;
  occurredAt: string;
  askingPrice: number | null;
  sold: boolean;
  buyerUsername: string | null;
  salePrice: number | null;
  soldAt: string | null;
}

interface PurchaseResult {
  purchased: boolean;
  price: number;
  victimUsername: string;
  killerUsername: string;
  state: string;
  occurredAt: string;
}

export default function WitnessPage() {
  const router = useRouter();
  const [statements, setStatements] = useState<WitnessStatement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const [buyId, setBuyId] = useState('');
  const [buyBusy, setBuyBusy] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [purchase, setPurchase] = useState<PurchaseResult | null>(null);

  const load = useCallback(async () => {
    const res = await apiFetch<{ statements: WitnessStatement[] }>('/api/v1/mafia/witness/me');
    if (!res.ok || !res.data) {
      setError(res.error?.message ?? 'Could not load your witness statements.');
      return;
    }
    setStatements(res.data.statements);
    setError(null);
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    load();
  }, [router, load]);

  async function listForSale(id: string) {
    const draft = priceDrafts[id];
    const price = Number(draft);
    if (!draft || !Number.isFinite(price) || price < 0) return;

    setBusyId(id);
    setMessage(null);
    const res = await apiFetch('/api/v1/mafia/witness/sell', {
      method: 'POST',
      body: JSON.stringify({ witnessStatementId: id, price: Math.round(price) }),
    });
    setBusyId(null);
    if (!res.ok) {
      setError(res.error?.message ?? 'Could not list that for sale.');
      return;
    }
    setMessage('Listed. Tell your buyer the statement ID and price.');
    await load();
  }

  async function buyStatement() {
    if (!buyId.trim()) return;
    setBuyBusy(true);
    setBuyError(null);
    setPurchase(null);
    const res = await apiFetch<PurchaseResult>(`/api/v1/mafia/witness/${encodeURIComponent(buyId.trim())}/buy`, {
      method: 'POST',
    });
    setBuyBusy(false);
    if (!res.ok || !res.data) {
      setBuyError(res.error?.message ?? 'Could not buy that.');
      return;
    }
    setPurchase(res.data);
    setBuyId('');
  }

  if (error && statements.length === 0) {
    return (
      <main style={pageStyle}>
        <p>{error}</p>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <div style={{ width: '100%', maxWidth: 640 }}>
        <NavBar />

        <h1 style={{ margin: '16px 0 4px' }}>Witness statements</h1>
        <p style={{ color: '#999', marginTop: 0 }}>
          Information you&apos;ve witnessed. List it at a price and tell your buyer the statement
          ID yourself — this page doesn&apos;t broadcast what&apos;s for sale to anyone else.
        </p>

        {message && <p style={{ color: '#4ade80', fontSize: 14 }}>{message}</p>}

        {statements.length === 0 && <p style={{ color: '#999' }}>You haven&apos;t witnessed anything yet.</p>}

        {statements.map((s) => (
          <div key={s.id} style={cardStyle}>
            <p style={{ margin: '0 0 4px', fontSize: 14 }}>
              <strong>{s.killerUsername}</strong> killed <strong>{s.victimUsername}</strong> in {s.state}
            </p>
            <p style={{ margin: '0 0 10px', color: '#999', fontSize: 12 }}>
              {new Date(s.occurredAt).toLocaleString()} · ID: <code>{s.id}</code>
            </p>

            {s.sold ? (
              <p style={{ margin: 0, color: '#4ade80', fontSize: 13 }}>
                Sold to {s.buyerUsername} for ${s.salePrice?.toLocaleString()}.
              </p>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={priceDrafts[s.id] ?? (s.askingPrice != null ? String(s.askingPrice) : '')}
                  onChange={(e) => setPriceDrafts((prev) => ({ ...prev, [s.id]: e.target.value }))}
                  placeholder="Asking price"
                  style={inputStyle}
                />
                <button
                  onClick={() => listForSale(s.id)}
                  disabled={busyId === s.id}
                  style={busyId === s.id ? buttonDisabledStyle : buttonStyle}
                >
                  {s.askingPrice != null ? 'Update price' : 'List for sale'}
                </button>
              </div>
            )}
          </div>
        ))}

        <h2 style={{ marginTop: 32, marginBottom: 12, fontSize: 18 }}>Buy a statement</h2>
        <p style={{ color: '#999', fontSize: 13, marginTop: 0 }}>
          Got a statement ID and price from someone? Paste the ID below — you&apos;ll be charged
          the listed price immediately.
        </p>
        <div style={cardStyle}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={buyId}
              onChange={(e) => setBuyId(e.target.value)}
              placeholder="Witness statement ID"
              style={inputStyle}
            />
            <button onClick={buyStatement} disabled={buyBusy || !buyId.trim()} style={buyBusy || !buyId.trim() ? buttonDisabledStyle : buttonStyle}>
              {buyBusy ? 'Buying…' : 'Buy'}
            </button>
          </div>
          {buyError && <p style={{ color: '#f87171', fontSize: 14, marginTop: 10 }}>{buyError}</p>}
          {purchase && (
            <p style={{ marginTop: 10, fontSize: 14 }}>
              Bought for ${purchase.price.toLocaleString()}: <strong>{purchase.killerUsername}</strong> killed{' '}
              <strong>{purchase.victimUsername}</strong> in {purchase.state} at{' '}
              {new Date(purchase.occurredAt).toLocaleString()}.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

const pageStyle: CSSProperties = { minHeight: '100vh', display: 'flex', justifyContent: 'center', padding: '48px 24px' };
const cardStyle: CSSProperties = { background: '#16161d', border: '1px solid #26262f', borderRadius: 8, padding: 16, marginTop: 12 };
const inputStyle: CSSProperties = {
  flex: 1,
  background: '#0d0d12',
  border: '1px solid #333',
  color: '#fff',
  padding: '8px 10px',
  borderRadius: 4,
  fontSize: 13,
};
const buttonStyle: CSSProperties = {
  padding: '8px 16px',
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
