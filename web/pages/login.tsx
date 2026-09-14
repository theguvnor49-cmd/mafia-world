import { useState, type CSSProperties, type FormEvent } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { apiFetch, setToken } from '../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await apiFetch<{ token: string }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
    setLoading(false);
    if (!res.ok || !res.data) {
      setError(res.error?.message ?? 'Login failed.');
      return;
    }
    setToken(res.data.token);
    router.push('/mafia');
  }

  return (
    <main style={pageStyle}>
      <form onSubmit={handleSubmit} style={formStyle}>
        <h1 style={{ margin: '0 0 16px', fontSize: '1.5rem' }}>Log In</h1>
        {error && <p style={{ color: '#f87171', fontSize: 14 }}>{error}</p>}
        <label style={labelStyle}>
          Username or email
          <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={inputStyle} />
        </label>
        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? 'Logging in…' : 'Log In'}
        </button>
        <p style={{ marginTop: 12, color: '#999', fontSize: 14 }}>
          No character yet?{' '}
          <Link href="/register" style={{ color: '#fff', textDecoration: 'underline' }}>
            Create one
          </Link>
        </p>
      </form>
    </main>
  );
}

const pageStyle: CSSProperties = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const formStyle: CSSProperties = { background: '#16161d', padding: 32, borderRadius: 8, width: 340, border: '1px solid #26262f' };
const labelStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14, fontSize: 14, color: '#bbb' };
const inputStyle: CSSProperties = { padding: '10px 12px', borderRadius: 4, border: '1px solid #333', background: '#0e0e13', color: '#fff', fontSize: 14 };
const buttonStyle: CSSProperties = {
  width: '100%',
  padding: 12,
  background: '#b91c1c',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  fontWeight: 600,
  cursor: 'pointer',
  marginTop: 8,
  fontSize: 14,
};
