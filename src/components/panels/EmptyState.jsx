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
          fontFamily: "'Space Mono', monospace", fontSize: 12, letterSpacing: '.14em',
          textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 10,
        }}>{section}</div>
        <div style={{ fontSize: 15, color: 'var(--ink3)', lineHeight: 1.6, marginBottom: 16 }}>
          Nenhuma missão em andamento. Defina a missão em <strong style={{ color: 'var(--ink2)' }}>Mission</strong> e
          escolha os componentes em <strong style={{ color: 'var(--ink2)' }}>Hardware</strong> — o restante da plataforma acompanha.
        </div>
        <button
          onClick={() => setSection('mission')}
          style={{
            padding: '7px 16px', borderRadius: 5, border: '1px solid var(--rule)',
            background: 'var(--navy)', color: 'rgba(255,255,255,.8)', cursor: 'pointer',
            fontFamily: "'Space Grotesk', sans-serif", fontSize: 14,
          }}
        >Ir para Mission →</button>
      </div>
    </div>
  )
}
