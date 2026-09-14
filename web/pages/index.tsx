import Link from 'next/link';
import type { CSSProperties } from 'react';

export default function Home() {
  return (
    <main style={pageStyle}>
      <h1 style={{ fontSize: '2.5rem', margin: '0 0 8px', letterSpacing: '0.05em' }}>MAFIA WORLD</h1>
      <p style={{ color: '#999', marginBottom: 32, maxWidth: 480 }}>
        A persistent, text-based criminal underworld. Build your empire. Watch your back.
      </p>
      <div style={{ display: 'flex', gap: 12 }}>
        <Link href="/login" style={btnStyle}>
          Log In
        </Link>
        <Link href="/register" style={{ ...btnStyle, background: '#b91c1c', borderColor: '#b91c1c' }}>
          Create Character
        </Link>
      </div>
    </main>
  );
}

const pageStyle: CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  textAlign: 'center',
};

const btnStyle: CSSProperties = {
  padding: '12px 24px',
  background: '#1f1f27',
  color: '#fff',
  borderRadius: 6,
  textDecoration: 'none',
  border: '1px solid #333',
  fontWeight: 600,
};
