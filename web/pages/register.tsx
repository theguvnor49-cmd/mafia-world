import { useState, type CSSProperties, type FormEvent } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { apiFetch, setToken } from '../lib/api';

export default function Register() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await apiFetch<{ token: string }>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    });
    setLoading(false);
    if (!res.ok || !res.data) {
      setError(res.error?.message ?? 'Registration failed.');
      return;
    }
    setToken(res.data.token);
    router.push('/mafia');
  }

  return (
    <main style={pageStyle}>
      <form onSubmit={handleSubmit} style={formStyle}>
        <h1 style={{ margin: '0 0 16px', fontSize: '1.5rem' }}>Create Your Character</h1>
        {error && <p style={{ color: '#f87171', fontSize: 14 }}>{error}</p>}
        <label style={labelStyle}>
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={3}
            maxLength={20}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            style={inputStyle}
          />
        </label>
        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? 'Creating…' : 'Enter the Underworld'}
        </button>
        <p style={{ marginTop: 12, color: '#999', fontSize: 14 }}>
          Already have a character?{' '}
          <Link href="/login" style={{ color: '#fff', textDecoration: 'underline' }}>
            Log in
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
