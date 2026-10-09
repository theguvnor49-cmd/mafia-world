import { useRouter } from 'next/router';
import Link from 'next/link';
import type { CSSProperties } from 'react';

const LINKS: { href: string; label: string }[] = [
  { href: '/mafia', label: 'Dashboard' },
  { href: '/mafia/crimes', label: 'Crimes' },
  { href: '/mafia/armoury', label: 'Armoury' },
  { href: '/mafia/hunt', label: 'Hunt' },
  { href: '/mafia/witness', label: 'Witness' },
  { href: '/mafia/bust', label: 'Jail bust-out' },
  { href: '/mafia/cars', label: 'Garage' },
  { href: '/mafia/co-op', label: 'Co-op heist' },
  { href: '/mafia/hospital', label: 'Hospital' },
  { href: '/mafia/gambling', label: 'Casino' },
  { href: '/mafia/gangs', label: 'Gangs' },
  { href: '/mafia/businesses', label: 'Businesses' },
];

/**
 * Phase 14 polish. Every `/mafia/*` subpage used to show only a bare
 * "← Back to dashboard" text link — the only way to move from, say,
 * Armoury to Hunt was always via the dashboard in between. This renders
 * the dashboard's own set of nav links at the top of every subpage
 * instead, so any system is one click from any other.
 *
 * Self-detects the current page via `useRouter()` rather than taking a
 * `current` prop, specifically so every call site is the identical
 * `<NavBar />` — one less thing to get subtly wrong across the dozen-
 * plus pages this replaces a line in. For a dynamic route like
 * `/mafia/gangs/[name]`, `router.pathname` is the literal template
 * string (not the resolved URL), so prefix-matching against it still
 * correctly highlights "Gangs" from a specific gang's own page.
 *
 * Deliberately excludes the dashboard's conditional "Admin →" link —
 * showing it here would need `isAdmin` threaded through as a prop from
 * every caller's own `/me` fetch (not all of which currently load a
 * shape that has it), for a link ordinary play never needs. Admins
 * already reach it from the dashboard itself.
 */
export default function NavBar() {
  const router = useRouter();
  return (
    <nav style={navStyle}>
      {LINKS.map((link) => {
        const active = router.pathname === link.href || (link.href !== '/mafia' && router.pathname.startsWith(link.href));
        return (
          <Link key={link.href} href={link.href} style={active ? activeLinkStyle : linkStyle}>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

const navStyle: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 };
const linkStyle: CSSProperties = {
  color: '#999',
  fontSize: 13,
  textDecoration: 'none',
  border: '1px solid #26262f',
  borderRadius: 4,
  padding: '6px 12px',
  background: '#16161d',
  whiteSpace: 'nowrap',
};
const activeLinkStyle: CSSProperties = {
  ...linkStyle,
  color: '#fff',
  borderColor: '#b91c1c',
  background: '#26161a',
};
