import useForge from '../../store/useForge'

// Shown in any workspace section when no mission has been loaded yet.
// Visual-first (the brand orbit-mark line motif) with one line of text, so
// every empty section still reads as a real application state.
export default function EmptyState({ section }) {
  const setSection = useForge(s => s.setSection)
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', maxWidth: 300 }}>
        {/* orbit-mark: planet on a tilted orbit + guiding star (thin line) */}
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor"
          strokeWidth="1.4" style={{ color: 'var(--ink4)', margin: '0 auto 14px', display: 'block' }}>
          <ellipse cx="32" cy="34" rx="24" ry="9.5" transform="rotate(-22 32 34)" />
          <circle cx="32" cy="34" r="7.5" />
          <path d="M49 13l1.7 4.5 4.5 1.7-4.5 1.7L49 25.4l-1.7-4.5L42.8 19.2l4.5-1.7z"
            fill="currentColor" stroke="none" />
        </svg>
        <div style={{
          fontFamily: "'Space Mono', monospace", fontSize: 12, letterSpacing: '.14em',
          textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 8,
        }}>{section}</div>
        <div style={{ fontSize: 14, color: 'var(--ink3)', lineHeight: 1.5, marginBottom: 16 }}>
          Defina a missão para liberar esta área.
        </div>
        <button
          onClick={() => setSection('mission')}
          style={{
            padding: '7px 16px', borderRadius: 'var(--r-md)', border: 'none',
            background: 'var(--btn-bg)', color: 'var(--btn-fg)', cursor: 'pointer',
            fontFamily: "'Space Grotesk', sans-serif", fontSize: 14,
          }}
        >Ir para Mission →</button>
      </div>
    </div>
  )
}
