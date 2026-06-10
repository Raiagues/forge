import useForge from '../../store/useForge'

// Shown in any workspace section when no mission has been loaded yet.
// Keeps every section behaving like a real application state instead of
// rendering blank.
export default function EmptyState({ section }) {
  const setSection = useForge(s => s.setSection)
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', maxWidth: 320 }}>
        <div style={{
          fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: '.14em',
          textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 10,
        }}>{section}</div>
        <div style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.6, marginBottom: 16 }}>
          Nenhuma missão carregada. Escolha um template em <strong style={{ color: 'var(--ink2)' }}>Mission</strong> para
          gerar o hardware, as conexões e a telemetria.
        </div>
        <button
          onClick={() => setSection('mission')}
          style={{
            padding: '7px 16px', borderRadius: 5, border: '1px solid var(--rule)',
            background: 'var(--navy)', color: 'rgba(255,255,255,.8)', cursor: 'pointer',
            fontFamily: "'Space Grotesk', sans-serif", fontSize: 12,
          }}
        >Ir para Mission →</button>
      </div>
    </div>
  )
}
