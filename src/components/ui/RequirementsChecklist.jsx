import { useEffect, useRef, useState } from 'react'
import useForge, { COMPONENT_DEFS } from '../../store/useForge'
import { getFramework, SOURCE_LABEL } from '../../mission/index.js'

// ──────────────────────────────────────────────────────────────────
// RequirementsChecklist — the live OBSAT requirements panel (Part 7).
//
// A persistent, collapsible panel reachable from any screen. Each
// competition requirement auto-checks when satisfied, stays unchecked
// when not yet met, and is flagged amber/red when actively violated.
// Click a requirement for a short explanation + how to satisfy it. It
// reads live.validation (already recomputed on every change) and matches
// issues to requirements by ruleId, so it updates in real time. Clean and
// secondary — never competes with the work area.
// ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: "'Space Mono', monospace" }
const clampPx = (v, max) => Math.max(8, Math.min(max, v))

// status of one requirement from the live validation issues
function reqStatus(rule, issues) {
  const iss = issues.find(i => i.ruleId === rule.id)
  if (!iss) return { state: 'ok', issue: null }
  return { state: iss.severity === 'error' ? 'violated' : 'unmet', issue: iss }
}

const DOT = { ok: 'var(--ok2)', unmet: 'var(--warn2)', violated: 'var(--err2)' }

function Mark({ state }) {
  if (state === 'ok') return <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="var(--ok2)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
  if (state === 'violated') return <span style={{ color: 'var(--err2)', fontWeight: 700, fontSize: 14, lineHeight: 1 }}>!</span>
  return <span style={{ width: 11, height: 11, borderRadius: '50%', border: `2px solid ${DOT.unmet}`, display: 'block' }} />
}

export default function RequirementsChecklist() {
  const { missionPlan, live, toggleHardware, entities, onboarding, transition } = useForge()
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(null)
  // The panel is DRAGGABLE (Part 5) so it never sits over the advance
  // button. null → default bottom-left dock; once dragged, {x,y} in px.
  const [pos, setPos] = useState(null)
  const dragRef = useRef(null)

  useEffect(() => {
    const onMove = (e) => {
      const d = dragRef.current
      if (!d) return
      if (Math.abs(e.clientX - d.x0) + Math.abs(e.clientY - d.y0) > 3) d.moved = true
      const x = clampPx(d.left + (e.clientX - d.x0), window.innerWidth - 56)
      const y = clampPx(d.top + (e.clientY - d.y0), window.innerHeight - 40)
      setPos({ x, y })
    }
    const onUp = () => {
      const d = dragRef.current
      if (d && !d.moved) setOpen(o => !o)   // a click, not a drag → toggle
      dragRef.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  const fw = getFramework(missionPlan.frameworkId)
  // only relevant once a competition with requirements is chosen
  if (!fw?.requirements?.length || onboarding || transition?.playing) return null

  const issues = live?.validation?.issues || []
  const rules = fw.requirements
  const reqs = rules.map(r => ({ rule: r, ...reqStatus(r, issues) }))
  const met = reqs.filter(r => r.state === 'ok').length
  const violated = reqs.filter(r => r.state === 'violated').length

  const startDrag = (e) => {
    const r = e.currentTarget.parentElement.getBoundingClientRect()
    dragRef.current = { x0: e.clientX, y0: e.clientY, left: r.left, top: r.top, moved: false }
  }
  // Default dock = bottom-RIGHT (was bottom-left, which sat on top of the
  // left sidebar nav icons). The right edge is clear of the persistent
  // navigation, keeps the pill visible without scrolling, and the panel
  // still expands upward on click. Remains draggable anywhere.
  const dock = pos ? { left: pos.x, top: pos.y } : { right: 14, bottom: 14 }

  return (
    <div style={{ position: 'fixed', ...dock, zIndex: 85, width: open ? 320 : 'auto' }}>
      {/* toggle pill — also the drag handle */}
      <button onMouseDown={startDrag} style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: open ? '8px 8px 0 0' : 8, cursor: 'grab',
        border: '1px solid var(--rule)', borderBottom: open ? 'none' : '1px solid var(--rule)',
        background: 'var(--paper)', boxShadow: '0 4px 14px rgba(14,30,51,.12)', width: '100%',
      }}>
        <span style={{ ...mono, fontSize: 11, color: 'var(--ink4)', cursor: 'grab' }}>⠿</span>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: violated ? 'var(--err2)' : met === rules.length ? 'var(--ok2)' : 'var(--warn2)' }} />
        <span style={{ ...mono, fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink3)' }}>Requisitos {fw.name}</span>
        <span style={{ ...mono, fontSize: 11, color: 'var(--ink4)' }}>{met}/{rules.length}</span>
        <span style={{ flex: 1 }} />
        <span style={{ ...mono, fontSize: 12, color: 'var(--ink4)' }}>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div style={{ border: '1px solid var(--rule)', borderTop: 'none', borderRadius: '0 0 8px 8px', background: 'var(--paper)', boxShadow: '0 8px 20px rgba(14,30,51,.14)', maxHeight: 360, overflowY: 'auto' }}>
          {reqs.map(({ rule, state, issue }) => {
            const isOpen = expanded === rule.id
            return (
              <div key={rule.id} style={{ borderBottom: '1px solid var(--rule2)' }}>
                <button onClick={() => setExpanded(isOpen ? null : rule.id)} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 9, width: '100%', textAlign: 'left',
                  padding: '9px 11px', border: 'none', background: 'none', cursor: 'pointer',
                }}>
                  <span style={{ width: 14, height: 14, marginTop: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Mark state={state} /></span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, color: state === 'ok' ? 'var(--ink3)' : 'var(--ink)', lineHeight: 1.35, textDecoration: state === 'ok' ? 'line-through' : 'none' }}>{rule.title}</span>
                    <span style={{ ...mono, fontSize: 9.5, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink4)' }}>{SOURCE_LABEL[rule.source] || rule.source}</span>
                  </span>
                </button>
                {isOpen && (
                  <div style={{ padding: '0 11px 11px 34px' }}>
                    <div style={{ fontSize: 12.5, color: 'var(--ink3)', lineHeight: 1.5, marginBottom: 6 }}>{issue?.detail || rule.detail}</div>
                    {issue?.suggestions?.filter(s => !entities[s.id]).slice(0, 2).map(s => (
                      <button key={s.id} onClick={() => toggleHardware(s.id)} style={{
                        fontSize: 12, cursor: 'pointer', padding: '3px 8px', borderRadius: 4, marginRight: 5,
                        border: '1px solid var(--rule)', background: 'var(--paper2)', color: 'var(--ink2)',
                        fontFamily: "'Space Grotesk', sans-serif",
                      }}>+ {COMPONENT_DEFS[s.id]?.friendly || s.label}</button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
