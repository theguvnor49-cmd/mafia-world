type Status = 'ALIVE' | 'DEAD' | 'JAIL' | 'HOSPITAL';

const CONFIG: Record<Status, { label: string; color: string; bg: string }> = {
  ALIVE: { label: '🟢 ALIVE', color: '#4ade80', bg: '#14231a' },
  DEAD: { label: '🔴 DEAD', color: '#f87171', bg: '#251515' },
  JAIL: { label: '🚔 JAIL', color: '#facc15', bg: '#26220f' },
  HOSPITAL: { label: '🏥 HOSPITAL', color: '#60a5fa', bg: '#131c26' },
};

export default function StatusBadge({ status }: { status: Status }) {
  const cfg = CONFIG[status] ?? CONFIG.ALIVE;
  return (
    <span
      style={{
        background: cfg.bg,
        color: cfg.color,
        padding: '6px 14px',
        borderRadius: 20,
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: '0.03em',
        whiteSpace: 'nowrap',
      }}
    >
      {cfg.label}
    </span>
  );
}
