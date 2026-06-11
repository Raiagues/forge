import useForge from '../../store/useForge'

// ──────────────────────────────────────────────────────────────────
// FeatureInfoModal — contextual explanation for coming-soon features.
// Nothing in the UI is a dead control: clicking a future module or
// competition opens this panel explaining what it will do, why it
// matters in the mission workflow and what is planned.
// ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: "'Space Mono', monospace" }

function Label({ children }) {
  return <div style={{ ...mono, fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink4)', margin: '14px 0 5px' }}>{children}</div>
}

export default function FeatureInfoModal() {
  const info = useForge(s => s.featureInfo)
  const closeFeatureInfo = useForge(s => s.closeFeatureInfo)
  if (!info) return null

  return (
    <div
      onClick={closeFeatureInfo}
      style={{
        position: 'absolute', inset: 0, zIndex: 80,
        background: 'rgba(26,24,20,.32)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 420, maxWidth: 'calc(100% - 48px)', maxHeight: '80%', overflowY: 'auto',
          background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 8,
          boxShadow: '0 14px 40px rgba(26,24,20,.25)', padding: '18px 20px 20px',
        }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ ...mono, fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--warn2)', marginBottom: 5 }}>
              em desenvolvimento
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 3 }}>{info.title}</div>
            {info.tech && <div style={{ ...mono, fontSize: 12, color: 'var(--ink3)', letterSpacing: '.05em' }}>{info.tech}</div>}
          </div>
          <button onClick={closeFeatureInfo} style={{
            width: 24, height: 24, borderRadius: 4, border: '1px solid var(--rule)', background: 'var(--paper2)',
            cursor: 'pointer', color: 'var(--ink3)', fontSize: 14, flexShrink: 0,
          }}>×</button>
        </div>

        <Label>O que faz</Label>
        <div style={{ fontSize: 14, color: 'var(--ink2)', lineHeight: 1.6 }}>{info.what}</div>

        <Label>Por que importa na missão</Label>
        <div style={{ fontSize: 14, color: 'var(--ink2)', lineHeight: 1.6 }}>{info.why}</div>

        {info.planned?.length > 0 && (
          <>
            <Label>Planejado</Label>
            {info.planned.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--rule2)' }}>
                <span style={{ ...mono, fontSize: 12, color: 'var(--ink4)', flexShrink: 0 }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ fontSize: 13.5, color: 'var(--ink3)', lineHeight: 1.5 }}>{p}</span>
              </div>
            ))}
          </>
        )}

        <div style={{ ...mono, fontSize: 11, color: 'var(--ink4)', marginTop: 14, lineHeight: 1.5 }}>
          Este módulo aparece na interface para você explorar o fluxo completo da missão — a implementação chega em versões futuras.
        </div>
      </div>
    </div>
  )
}
