import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/router';
import { apiFetch, getToken } from '../../lib/api';
import NavBar from '../../components/NavBar';

interface Gun {
  name: string;
  bulletMultiplier: number;
  price: number;
  description: string | null;
}

interface Armour {
  name: string;
  bonusBullets: number;
  multiplier: number;
  price: number;
  description: string | null;
}

interface Rank {
  index: number;
  name: string;
  minXp: number;
  baseBulletsToKill: number;
}

interface MeSummary {
  cash: number;
  equippedGun: { name: string; bulletMultiplier: number } | null;
  equippedArmour: { name: string; bonusBullets: number; multiplier: number } | null;
}

export default function ArmouryPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeSummary | null>(null);
  const [guns, setGuns] = useState<Gun[]>([]);
  const [armour, setArmour] = useState<Armour[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [calcGun, setCalcGun] = useState('');
  const [calcArmour, setCalcArmour] = useState('none');
  const [calcRank, setCalcRank] = useState('');
  const [calcResult, setCalcResult] = useState<number | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    const [meRes, gunsRes, armourRes, ranksRes] = await Promise.all([
      apiFetch<MeSummary>('/api/v1/me'),
      apiFetch<{ guns: Gun[] }>('/api/v1/mafia/weapons/guns'),
      apiFetch<{ armour: Armour[] }>('/api/v1/mafia/weapons/armour'),
      apiFetch<{ ranks: Rank[] }>('/api/v1/ranks'),
    ]);

    if (!meRes.ok || !meRes.data) {
      setError(meRes.error?.message ?? 'Could not load your profile.');
      return;
    }
    setMe(meRes.data);
    if (gunsRes.ok && gunsRes.data) setGuns(gunsRes.data.guns);
    if (armourRes.ok && armourRes.data) setArmour(armourRes.data.armour);
    if (ranksRes.ok && ranksRes.data) setRanks(ranksRes.data.ranks);
    setError(null);
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    loadAll();
  }, [router, loadAll]);

  // Default the calculator's dropdowns once their options arrive — split
  // out from loadAll so loadAll's identity never changes and the mount
  // effect above only ever runs once.
  useEffect(() => {
    if (guns[0] && !calcGun) setCalcGun(guns[0].name);
  }, [guns, calcGun]);
  useEffect(() => {
    if (ranks[0] && !calcRank) setCalcRank(ranks[0].name);
  }, [ranks, calcRank]);

  async function buy(kind: 'guns' | 'armour', name: string) {
    setBusyItem(name);
    setMessage(null);
    const res = await apiFetch(`/api/v1/mafia/weapons/${kind}/${encodeURIComponent(name)}/buy`, { method: 'POST' });
    setBusyItem(null);
    if (!res.ok) {
      setMessage(res.error?.message ?? 'Purchase failed.');
      return;
    }
    setMessage(`Equipped ${name}.`);
    await loadAll();
  }

  async function runCalculator() {
    setCalcError(null);
    setCalcResult(null);
    if (!calcGun || !calcRank) return;
    const params = new URLSearchParams({ gun: calcGun, targetRank: calcRank });
    if (calcArmour !== 'none') params.set('armour', calcArmour);

    const res = await apiFetch<{ bulletsNeeded: number }>(`/api/v1/mafia/weapons/calculator?${params.toString()}`);
    if (!res.ok || !res.data) {
      setCalcError(res.error?.message ?? 'Could not calculate that.');
      return;
    }
    setCalcResult(res.data.bulletsNeeded);
  }

  if (error) return <main style={pageStyle}><p>{error}</p></main>;
  if (!me) return <main style={pageStyle}><p>Loading…</p></main>;

  return (
    <main style={pageStyle}>
      <div style={{ width: '100%', maxWidth: 760 }}>
        <NavBar />

        <h1 style={{ margin: '16px 0 4px' }}>Armoury</h1>
        <p style={{ color: '#999', marginTop: 0 }}>
          Cash: ${me.cash.toLocaleString()} · Equipped: {me.equippedGun?.name ?? 'No gun'} /{' '}
          {me.equippedArmour?.name ?? 'No armour'}
        </p>

        {message && <p style={{ color: '#4ade80', fontSize: 14 }}>{message}</p>}

        <h2 style={sectionHeadingStyle}>Guns</h2>
        <div style={shopGridStyle}>
          {guns.map((gun) => {
            const equipped = me.equippedGun?.name === gun.name;
            const afford = me.cash >= gun.price;
            const disabled = equipped || !afford || busyItem === gun.name;
            return (
              <div key={gun.name} style={cardStyle}>
                <div style={{ fontWeight: 700 }}>{gun.name}</div>
                <div style={{ color: '#999', fontSize: 13, margin: '4px 0' }}>{gun.description}</div>
                <div style={{ fontSize: 13, color: '#999' }}>Multiplier: {gun.bulletMultiplier.toFixed(2)}x</div>
                <div style={{ fontSize: 13, color: '#999', marginBottom: 10 }}>${gun.price.toLocaleString()}</div>
                <button onClick={() => buy('guns', gun.name)} disabled={disabled} style={disabled ? buttonDisabledStyle : buttonStyle}>
                  {equipped ? 'Equipped' : busyItem === gun.name ? 'Buying…' : afford ? 'Buy & equip' : "Can't afford"}
                </button>
              </div>
            );
          })}
        </div>

        <h2 style={sectionHeadingStyle}>Armour</h2>
        <div style={shopGridStyle}>
          {armour.map((item) => {
            const equipped = me.equippedArmour?.name === item.name;
            const afford = me.cash >= item.price;
            const disabled = equipped || !afford || busyItem === item.name;
            return (
              <div key={item.name} style={cardStyle}>
                <div style={{ fontWeight: 700 }}>{item.name}</div>
                <div style={{ color: '#999', fontSize: 13, margin: '4px 0' }}>{item.description}</div>
                <div style={{ fontSize: 13, color: '#999' }}>
                  +{item.bonusBullets} bullets · {item.multiplier.toFixed(2)}x
                </div>
                <div style={{ fontSize: 13, color: '#999', marginBottom: 10 }}>${item.price.toLocaleString()}</div>
                <button onClick={() => buy('armour', item.name)} disabled={disabled} style={disabled ? buttonDisabledStyle : buttonStyle}>
                  {equipped ? 'Equipped' : busyItem === item.name ? 'Buying…' : afford ? 'Buy & equip' : "Can't afford"}
                </button>
              </div>
            );
          })}
        </div>

        <h2 style={sectionHeadingStyle}>Bullet calculator</h2>
        <p style={{ color: '#999', fontSize: 13, marginTop: 0 }}>
          Informational only — preview how many bullets a hypothetical gun vs. target combination would take.
          Real kills always get calculated server-side for real, once that phase lands.
        </p>
        <div style={cardStyle}>
          <div style={calcRowStyle}>
            <label style={labelStyle}>
              Your gun
              <select value={calcGun} onChange={(e) => setCalcGun(e.target.value)} style={selectStyle}>
                {guns.map((g) => (
                  <option key={g.name} value={g.name}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              Target&apos;s armour
              <select value={calcArmour} onChange={(e) => setCalcArmour(e.target.value)} style={selectStyle}>
                <option value="none">None</option>
                {armour.map((a) => (
                  <option key={a.name} value={a.name}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              Target&apos;s rank
              <select value={calcRank} onChange={(e) => setCalcRank(e.target.value)} style={selectStyle}>
                {ranks.map((r) => (
                  <option key={r.name} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button onClick={runCalculator} style={{ ...buttonStyle, marginTop: 14 }}>
            Calculate
          </button>
          {calcError && <p style={{ color: '#f87171', fontSize: 14 }}>{calcError}</p>}
          {calcResult !== null && (
            <p style={{ marginTop: 14, fontSize: 18 }}>
              <strong>{calcResult.toLocaleString()}</strong> bullets needed
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

const pageStyle: CSSProperties = { minHeight: '100vh', display: 'flex', justifyContent: 'center', padding: '48px 24px' };
const cardStyle: CSSProperties = { background: '#16161d', border: '1px solid #26262f', borderRadius: 8, padding: 16 };
const sectionHeadingStyle: CSSProperties = { marginTop: 32, marginBottom: 12, fontSize: 18 };
const shopGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 };
const calcRowStyle: CSSProperties = { display: 'flex', gap: 16, flexWrap: 'wrap' };
const labelStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#999', flex: '1 1 160px' };
const selectStyle: CSSProperties = {
  background: '#0d0d12',
  border: '1px solid #333',
  color: '#fff',
  padding: '8px 10px',
  borderRadius: 4,
  fontSize: 14,
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
  width: '100%',
};
const buttonDisabledStyle: CSSProperties = {
  ...buttonStyle,
  background: '#333',
  color: '#777',
  cursor: 'not-allowed',
};
