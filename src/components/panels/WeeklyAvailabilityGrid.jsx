import { useCallback, useRef, useState } from 'react'
import useForge from '../../store/useForge'
import {
  DAYS, DAY_LABELS, HOURS_START, HOUR_COUNT,
  slotKey, SLOT_TYPES, cycleSlot, superimpose, memberColor,
} from '../../mission/availability.js'

// ──────────────────────────────────────────────────────────────────
// WeeklyAvailabilityGrid — per-member recurring free/blocked hours
// superimposed on one weekly grid. Members paint their own schedule;
// the overlay shows everyone at once with coloured pips. Toggle-able
// from the schedule view and the team screen.
//
// Interaction: click cycles free → blocked → off. Drag-paint fills a
// stripe of the paint type set by the first click in the drag.
// ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: "'Space Mono', monospace" }
const CELL_W = 42
const CELL_H = 26
const TYPE_COLOR = { free: 'var(--ok2)', blocked: 'var(--err2)' }
const TYPE_LABEL = { free: 'livre', blocked: 'ocupado' }

export default function WeeklyAvailabilityGrid({ team, poster }) {
  const availability = useForge(s => s.availability)
  const setMemberAvailability = useForge(s => s.setMemberAvailability)
  const user = useForge(s => s.auth.user)
  const [editingId, setEditingId] = useState(null)
  const drag = useRef(null)

  const members = team?.members || []
  const grid = superimpose(members, availability)
  const memberIdx = Object.fromEntries(members.map((m, i) => [m.memberId, i]))

  // who is being edited (defaults to current user)
  const editMember = editingId ?? user?.id
  const editSched = editMember != null ? (availability[editMember] || {}) : null

  const onCellDown = useCallback((day, hour) => {
    if (editMember == null) return
    const sched = useForge.getState().availability[editMember] || {}
    const key = slotKey(day, hour)
    const updated = cycleSlot(sched, key)
    const paintType = updated[key] || null
    setMemberAvailability(editMember, updated)
    drag.current = { paintType, memberId: editMember }
  }, [editMember, setMemberAvailability])

  const onCellEnter = useCallback((day, hour) => {
    if (!drag.current) return
    const key = slotKey(day, hour)
    const sched = useForge.getState().availability[drag.current.memberId] || {}
    if (sched[key] === drag.current.paintType) return
    const next = { ...sched }
    if (drag.current.paintType) next[key] = drag.current.paintType
    else delete next[key]
    setMemberAvailability(drag.current.memberId, next)
  }, [setMemberAvailability])

  const onUp = useCallback(() => { drag.current = null }, [])

  // poster vs workspace palette
  const fg = poster ? 'var(--poster-fg)' : 'var(--ink)'
  const fgDim = poster ? 'var(--poster-fg-dim)' : 'var(--ink3)'
  const line = poster ? 'var(--poster-line)' : 'var(--rule)'
  const cardBg = poster ? 'var(--poster-card)' : 'var(--paper2)'
  const headerBg = poster ? 'var(--poster-card-sel)' : 'var(--paper3, var(--paper2))'

  return (
    <div onPointerUp={onUp} onPointerLeave={onUp} style={{ userSelect: 'none' }}>
      {/* member selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ ...mono, fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: fgDim }}>Editar horários de:</span>
        {members.map((m, i) => (
          <button key={m.memberId} onClick={() => setEditingId(m.memberId)}
            style={{
              ...mono, fontSize: 11, padding: '3px 9px', borderRadius: 5, cursor: 'pointer',
              border: editMember === m.memberId ? `2px solid ${memberColor(m.memberId, i)}` : `1px solid ${line}`,
              background: editMember === m.memberId ? cardBg : 'transparent',
              color: editMember === m.memberId ? fg : fgDim,
              fontWeight: editMember === m.memberId ? 700 : 400,
            }}>
            <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: memberColor(m.memberId, i), marginRight: 5 }} />
            {m.name || m.username}
          </button>
        ))}
      </div>

      {/* legend */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 8 }}>
        {Object.entries(TYPE_LABEL).map(([type, label]) => (
          <span key={type} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: TYPE_COLOR[type], opacity: 0.7 }} />
            <span style={{ ...mono, fontSize: 10, color: fgDim }}>{label}</span>
          </span>
        ))}
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, border: `1px dashed ${line}`, background: 'transparent' }} />
          <span style={{ ...mono, fontSize: 10, color: fgDim }}>sem marcação</span>
        </span>
      </div>

      {/* grid */}
      <div style={{ overflowX: 'auto', border: `1px solid ${line}`, borderRadius: 9, background: cardBg }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: DAYS.length * CELL_W + 52 }}>
          <thead>
            <tr>
              <th style={{ ...mono, fontSize: 10, color: fgDim, padding: '5px 6px', textAlign: 'left', background: headerBg, borderBottom: `1px solid ${line}`, position: 'sticky', left: 0, zIndex: 1 }}>hr</th>
              {DAYS.map((d, di) => (
                <th key={d} style={{ ...mono, fontSize: 10, color: fgDim, padding: '5px 2px', textAlign: 'center', background: headerBg, borderBottom: `1px solid ${line}`, minWidth: CELL_W }}>
                  {DAY_LABELS[di].slice(0, 3)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: HOUR_COUNT }, (_, hi) => {
              const hour = HOURS_START + hi
              return (
                <tr key={hour}>
                  <td style={{ ...mono, fontSize: 10, color: fgDim, padding: '2px 6px', borderBottom: `1px solid ${line}`, background: headerBg, position: 'sticky', left: 0, zIndex: 1 }}>
                    {String(hour).padStart(2, '0')}:00
                  </td>
                  {DAYS.map(d => {
                    const key = slotKey(d, hour)
                    const entries = grid[key] || []
                    const own = editSched?.[key]
                    return (
                      <td key={d}
                        onPointerDown={() => onCellDown(d, hour)}
                        onPointerEnter={() => onCellEnter(d, hour)}
                        style={{
                          padding: 1, borderBottom: `1px solid ${line}`, borderLeft: `1px solid ${line}`,
                          cursor: 'pointer', textAlign: 'center', verticalAlign: 'middle',
                          background: own ? `${TYPE_COLOR[own]}18` : 'transparent',
                          minWidth: CELL_W, height: CELL_H,
                        }}
                        title={entries.length ? entries.map(e => `${e.name}: ${TYPE_LABEL[e.type]}`).join('\n') : 'clique para marcar'}>
                        {/* per-member pips */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'center', alignItems: 'center', minHeight: 14 }}>
                          {entries.map(e => (
                            <span key={e.memberId} style={{
                              width: 7, height: 7, borderRadius: '50%',
                              background: memberColor(e.memberId, memberIdx[e.memberId]),
                              opacity: e.type === SLOT_TYPES.FREE ? 0.85 : 0.5,
                              border: e.type === SLOT_TYPES.BLOCKED ? '1.5px solid var(--err2)' : 'none',
                              boxSizing: 'border-box',
                            }} />
                          ))}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* summary row: per-member total free hours */}
      {members.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
          {members.map((m, i) => {
            const sched = availability[m.memberId] || {}
            const freeCount = Object.values(sched).filter(v => v === SLOT_TYPES.FREE).length
            const blockedCount = Object.values(sched).filter(v => v === SLOT_TYPES.BLOCKED).length
            return (
              <div key={m.memberId} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: memberColor(m.memberId, i) }} />
                <span style={{ ...mono, fontSize: 10.5, color: fg }}>{m.name || m.username}</span>
                <span style={{ ...mono, fontSize: 10, color: fgDim }}>{freeCount}h livre · {blockedCount}h ocupado</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
