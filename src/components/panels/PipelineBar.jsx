import useForge from '../../store/useForge'
import { PHASES, derivePhases } from '../../mission/index.js'

// ──────────────────────────────────────────────────────────────────
// PipelineBar — the persistent top pipeline (Part 9 of the redesign).
//
// A ≤40px horizontal strip under the main nav, on every workspace screen:
// the five phases as nodes on a line. Completed phases are filled, the
// current phase carries the accent, future phases are dimmed; clicking an
// unlocked phase navigates. Driven by the shared phases.js predicate, so
// it never disagrees with the sidebar. Replaces having to remember where
// you are or how to get back.
// ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: "'Space Mono', monospace" }

function Check() {
  return <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
}

export default function PipelineBar() {
  const store = useForge()
  const { setSection, showPopover } = store
  const { status } = derivePhases(store)

  const click = (p, anchorEl) => {
    if (status[p.id].locked) {
      showPopover({ anchorEl, message: 'Esta fase abre depois que houver hardware na placa.', hint: 'defina a missão e escolha os componentes em Hardware' })
      return
    }
    setSection(p.section)
  }

  return (
    <div style={{
      height: 38, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 0, padding: '0 16px', background: 'var(--paper3)', borderBottom: '1px solid var(--rule)',
    }}>
      {PHASES.map((p, i) => {
        const st = status[p.id]
        const fill = st.done ? 'var(--ok2)' : st.current ? 'var(--acc)' : 'transparent'
        const ring = st.done ? 'var(--ok2)' : st.current ? 'var(--acc)' : 'var(--rule)'
        const txt = st.current ? 'var(--ink)' : st.locked ? 'var(--ink4)' : 'var(--ink3)'
        return (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center' }}>
            {i > 0 && <div style={{ width: 'clamp(16px, 4vw, 56px)', height: 2, background: status[PHASES[i - 1].id].done ? 'var(--ok2)' : 'var(--rule)', opacity: status[PHASES[i - 1].id].done ? .5 : 1 }} />}
            <button onClick={(e) => click(p, e.currentTarget)} title={p.label}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 8px', border: 'none', background: 'none', cursor: st.locked ? 'default' : 'pointer' }}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: fill, border: `1.5px solid ${ring}`, color: st.done || st.current ? '#fff' : st.locked ? 'var(--ink4)' : 'var(--ink3)',
                ...mono, fontSize: 10, fontWeight: 700,
                boxShadow: st.current ? '0 0 0 3px rgba(158,74,44,.16)' : 'none' }}>
                {st.done ? <Check /> : i + 1}
              </span>
              <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 12.5, fontWeight: st.current ? 700 : 500, color: txt, whiteSpace: 'nowrap' }}>{p.label}</span>
            </button>
          </div>
        )
      })}
    </div>
  )
}
