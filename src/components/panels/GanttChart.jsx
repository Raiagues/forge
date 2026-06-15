import { useEffect, useRef, useState } from 'react'
import useForge from '../../store/useForge'
import { PHASES, PHASE_DEPS } from '../../mission/index.js'
import { resolveSchedule, earliestStart, todayOffset, phaseScheduleState } from '../../mission/schedule.js'
import { mono, slab, CREAM, GOLD } from '../onboarding/posterKit.jsx'

// ──────────────────────────────────────────────────────────────────
// GanttChart — interactive timeline for the development pipeline (Prompt B
// Part 3). Each pipeline phase is a draggable/resizable bar; dependency
// arrows connect required → dependent phases and constrain edits (a phase
// can't start before its dependencies end). A "hoje" marker and per-phase
// schedule health (atrasado/no prazo/concluído) give live variance, and a
// movable competition-deadline marker warns on overrun. Day/week/month
// zoom. State persists in the store (store.schedule).
// ──────────────────────────────────────────────────────────────────

const ZOOM = { dia: 22, semana: 8, mês: 2.6 }
const ROW_H = 40, LABEL_W = 132, PAD = 16
const STATE_COLOR = { late: 'var(--err2)', ontrack: GOLD, ahead: 'var(--ok2)', done: 'var(--ok2)', future: 'var(--poster-line)' }
const STATE_LABEL = { late: 'atrasado', ontrack: 'no prazo', ahead: 'adiantado', done: 'concluído', future: 'a iniciar' }

export default function GanttChart() {
  const schedule = useForge(s => s.schedule)
  const phaseState = useForge(s => s.phaseState)
  const setPhaseDates = useForge(s => s.setPhaseDates)
  const setScheduleStart = useForge(s => s.setScheduleStart)
  const setScheduleDeadline = useForge(s => s.setScheduleDeadline)
  const [zoom, setZoom] = useState('semana')
  const ppd = ZOOM[zoom]
  const drag = useRef(null)

  // anchor the project start to today on first view so variance is real
  useEffect(() => { if (!schedule.startDate) setScheduleStart(new Date().toISOString()) }, [schedule.startDate, setScheduleStart])

  const plan = resolveSchedule(schedule)
  const maxEnd = Math.max(schedule.deadlineDay + 6, ...PHASES.map(p => plan[p.id][1] + 4))
  const today = todayOffset(schedule.startDate)
  const lastEnd = Math.max(...PHASES.map(p => plan[p.id][1]))
  const overrun = lastEnd > schedule.deadlineDay
  const width = LABEL_W + maxEnd * ppd + PAD

  const onBarDown = (e, id, mode) => {
    e.stopPropagation()
    drag.current = { id, mode, x0: e.clientX, s0: plan[id][0], e0: plan[id][1] }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  const onMove = (e) => {
    const d = drag.current; if (!d) return
    const dd = Math.round((e.clientX - d.x0) / ppd)
    const minStart = earliestStart(d.id, plan)
    if (d.mode === 'move') {
      const len = d.e0 - d.s0
      const start = Math.max(minStart, d.s0 + dd)
      setPhaseDates(d.id, start, start + len)
    } else {
      setPhaseDates(d.id, d.s0, Math.max(d.s0 + 1, d.e0 + dd))
    }
  }
  const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); drag.current = null }

  const x = (day) => LABEL_W + day * ppd
  const rowY = (i) => i * ROW_H + ROW_H / 2

  return (
    <div style={{ marginBottom: 30 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <div style={{ ...slab, fontSize: 18, fontWeight: 700, color: CREAM }}>Cronograma do projeto</div>
        <span style={{ flex: 1 }} />
        {overrun && <span style={{ ...mono, fontSize: 10.5, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--err2)' }}>⚠ passa do prazo</span>}
        <div style={{ display: 'flex', border: '1px solid var(--poster-line)', borderRadius: 5, overflow: 'hidden' }}>
          {Object.keys(ZOOM).map(z => (
            <button key={z} onClick={() => setZoom(z)} style={{ ...mono, fontSize: 11, padding: '3px 9px', border: 'none', cursor: 'pointer', background: zoom === z ? GOLD : 'transparent', color: zoom === z ? 'var(--poster-bg-solid)' : 'var(--poster-fg-dim)' }}>{z}</button>
          ))}
        </div>
        <label style={{ ...mono, fontSize: 11, color: 'var(--poster-fg-dim)', display: 'flex', alignItems: 'center', gap: 5 }}>
          prazo (dias)
          <input type="number" value={schedule.deadlineDay} onChange={e => setScheduleDeadline(+e.target.value || 1)}
            style={{ width: 54, padding: '3px 6px', borderRadius: 4, border: '1px solid var(--poster-line)', background: 'var(--poster-card)', color: CREAM, ...mono, fontSize: 12 }} />
        </label>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid var(--poster-line)', borderRadius: 10, background: 'var(--poster-card)', padding: '10px 0' }}>
        <div style={{ position: 'relative', width, height: PHASES.length * ROW_H + 8 }}>
          {/* dependency arrows + markers */}
          <svg width={width} height={PHASES.length * ROW_H + 8} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}>
            {/* today marker */}
            <line x1={x(today)} y1={0} x2={x(today)} y2={PHASES.length * ROW_H} stroke={GOLD} strokeWidth={1.5} strokeDasharray="3 3" />
            <text x={x(today) + 4} y={10} style={{ ...mono }} fontSize="9" fill={GOLD}>hoje</text>
            {/* deadline marker */}
            <line x1={x(schedule.deadlineDay)} y1={0} x2={x(schedule.deadlineDay)} y2={PHASES.length * ROW_H} stroke="var(--err2)" strokeWidth={1.5} />
            <text x={x(schedule.deadlineDay) + 4} y={20} style={{ ...mono }} fontSize="9" fill="var(--err2)">prazo</text>
            {/* dependency arrows */}
            {PHASES.map((p, i) => (PHASE_DEPS[p.id] || []).map(r => {
              const ri = PHASES.findIndex(q => q.id === r)
              if (ri < 0) return null
              const x1 = x(plan[r][1]), y1 = rowY(ri), x2 = x(plan[p.id][0]), y2 = rowY(i)
              return <path key={`${r}-${p.id}`} d={`M${x1},${y1} C${x1 + 14},${y1} ${x2 - 14},${y2} ${x2},${y2}`} fill="none" stroke="var(--poster-fg-dim)" strokeWidth={1.2} markerEnd="url(#g-arr)" opacity={0.7} />
            }))}
            <defs><marker id="g-arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="var(--poster-fg-dim)" /></marker></defs>
          </svg>

          {/* rows */}
          {PHASES.map((p, i) => {
            const [s, e] = plan[p.id]
            const ps = phaseState[p.id] || {}
            const health = phaseScheduleState(p.id, plan, { confirmed: ps.confirmed, confirmedAt: ps.confirmedAt, startISO: schedule.startDate })
            const col = STATE_COLOR[health]
            return (
              <div key={p.id} style={{ position: 'absolute', top: i * ROW_H, left: 0, right: 0, height: ROW_H, display: 'flex', alignItems: 'center' }}>
                <div style={{ width: LABEL_W, flexShrink: 0, paddingLeft: 12, ...mono, fontSize: 12, color: CREAM, display: 'flex', flexDirection: 'column' }}>
                  <span>{p.label}</span>
                  <span style={{ fontSize: 9.5, color: col }}>{STATE_LABEL[health]}</span>
                </div>
                {/* bar */}
                <div onPointerDown={(ev) => onBarDown(ev, p.id, 'move')}
                  title={`${p.label}: dia ${s}–${e} (${e - s}d)`}
                  style={{ position: 'absolute', left: x(s), width: Math.max(8, (e - s) * ppd), top: ROW_H / 2 - 9, height: 18, borderRadius: 5, cursor: 'grab',
                    background: health === 'done' || health === 'ahead' ? col : `${GOLD}`, opacity: health === 'future' ? 0.55 : 1,
                    border: `1px solid ${col}`, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                  {(ps.confirmed) && <span style={{ ...mono, fontSize: 10, color: 'var(--poster-bg-solid)', paddingRight: 4 }}>✓</span>}
                  {/* resize handle */}
                  <span onPointerDown={(ev) => onBarDown(ev, p.id, 'resize')} style={{ position: 'absolute', right: -3, top: 0, width: 10, height: 18, cursor: 'ew-resize' }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div style={{ ...mono, fontSize: 10.5, color: 'var(--poster-fg-dim)', marginTop: 8, lineHeight: 1.6 }}>
        arraste as barras para reagendar · a dependência impede começar antes da fase anterior terminar · datas em dias a partir do início do projeto
      </div>
    </div>
  )
}
