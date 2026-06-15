import useForge from '../../store/useForge'
import { PHASES, derivePhases } from '../../mission/index.js'
import { resolveSchedule, todayOffset, phaseScheduleState } from '../../mission/schedule.js'

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

const SCHED_COLOR = { late: 'var(--err2)', ontrack: 'var(--acc)', ahead: 'var(--ok2)', done: 'var(--ok2)', future: 'var(--rule)' }
// which phase a validation issue belongs to, so errors surface early on
// the pipeline node instead of only inline on the canvas (UX audit §7)
const PHASE_OF_SOURCE = { objective: 'mission', budget: 'mission', competition: 'mission', framework: 'mission', wiring: 'hardware', dependency: 'hardware', communication: 'hardware', pins: 'hardware' }

// compact planned-duration bar with a "today" marker (Prompt B Part 5)
function MiniTimeline({ range, maxEnd, today, color, onClick }) {
  const [s, e] = range
  const pct = (d) => `${Math.min(100, (d / maxEnd) * 100)}%`
  return (
    <div onClick={onClick} title="abrir cronograma" style={{ position: 'relative', height: 4, width: 92, marginTop: 3, borderRadius: 2, background: 'var(--rule2)', cursor: 'pointer' }}>
      <div style={{ position: 'absolute', left: pct(s), width: `${Math.max(3, ((e - s) / maxEnd) * 100)}%`, top: 0, height: 4, borderRadius: 2, background: color, opacity: 0.85 }} />
      <div style={{ position: 'absolute', left: pct(today), top: -2, width: 1.5, height: 8, background: 'var(--warn2)' }} />
    </div>
  )
}

export default function PipelineBar() {
  const store = useForge()
  const { setSection, showPopover } = store
  const { status } = derivePhases(store)
  const plan = resolveSchedule(store.schedule)
  const today = todayOffset(store.schedule?.startDate)
  const maxEnd = Math.max(...PHASES.map(p => plan[p.id][1]), today + 1)
  const errBy = {}
  ;(store.live?.validation?.issues || []).forEach(it => {
    if (it.severity !== 'error') return
    const ph = PHASE_OF_SOURCE[it.source]; if (ph) errBy[ph] = (errBy[ph] || 0) + 1
  })

  const click = (p, anchorEl) => {
    if (status[p.id].locked) {
      showPopover({ anchorEl, message: 'Esta fase abre depois que houver hardware na placa.', hint: 'defina a missão e escolha os componentes em Hardware' })
      return
    }
    setSection(p.section)
  }

  return (
    <div style={{
      flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 0, padding: '5px 16px', background: 'var(--paper3)', borderBottom: '1px solid var(--rule)',
    }}>
      {PHASES.map((p, i) => {
        const st = status[p.id]
        const ps = store.phaseState?.[p.id] || {}
        const health = phaseScheduleState(p.id, plan, { confirmed: ps.confirmed, confirmedAt: ps.confirmedAt, startISO: store.schedule?.startDate })
        const fill = st.done ? 'var(--ok2)' : st.current ? 'var(--acc)' : 'transparent'
        const ring = st.done ? 'var(--ok2)' : st.current ? 'var(--acc)' : 'var(--rule)'
        const txt = st.current ? 'var(--ink)' : st.locked ? 'var(--ink4)' : 'var(--ink3)'
        return (
          <div key={p.id} style={{ display: 'flex', alignItems: 'flex-start' }}>
            {i > 0 && <div style={{ width: 'clamp(12px, 3vw, 44px)', height: 2, marginTop: 13, background: status[PHASES[i - 1].id].done ? 'var(--ok2)' : 'var(--rule)', opacity: status[PHASES[i - 1].id].done ? .5 : 1 }} />}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
              <button onClick={(e) => click(p, e.currentTarget)} title={p.label}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 8px', border: 'none', background: 'none', cursor: st.locked ? 'default' : 'pointer' }}>
                <span style={{ position: 'relative', width: 18, height: 18, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: fill, border: `1.5px solid ${errBy[p.id] ? 'var(--err2)' : ring}`, color: st.done || st.current ? '#fff' : st.locked ? 'var(--ink4)' : 'var(--ink3)',
                  ...mono, fontSize: 10, fontWeight: 700,
                  boxShadow: st.current ? '0 0 0 3px rgba(158,74,44,.16)' : 'none' }}>
                  {st.done ? <Check /> : i + 1}
                  {errBy[p.id] > 0 && (
                    <span title={`${errBy[p.id]} erro(s) nesta fase`} style={{ position: 'absolute', top: -6, right: -6, minWidth: 13, height: 13, padding: '0 3px', borderRadius: 7, background: 'var(--err2)', color: '#fff', ...mono, fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid var(--paper3)' }}>{errBy[p.id]}</span>
                  )}
                </span>
                <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 12.5, fontWeight: st.current ? 700 : 500, color: txt, whiteSpace: 'nowrap' }}>{p.label}</span>
                {st.needsUpdate && <span title="atualização necessária" style={{ ...mono, fontSize: 11, color: 'var(--warn2)' }}>⟳</span>}
                {health === 'late' && !st.done && <span title="atrasado" style={{ ...mono, fontSize: 11, color: 'var(--err2)' }}>!</span>}
              </button>
              <MiniTimeline range={plan[p.id]} maxEnd={maxEnd} today={today} color={SCHED_COLOR[health]} onClick={() => setSection('schedule')} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
