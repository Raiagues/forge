import { useState } from 'react'
import useForge from '../../store/useForge'
import { OBSAT, getFramework, derivePhases } from '../../mission/index.js'
import { resolveSchedule, todayOffset, phaseScheduleState } from '../../mission/schedule.js'
import { mono } from '../onboarding/posterKit.jsx'

// ──────────────────────────────────────────────────────────────────
// ObsatWidget — compact sidebar widget showing OBSat phase status,
// days remaining and a traffic-light derived from pipeline completion
// vs expected pace. Expands to a detail panel with:
//   • OBSat phase timeline
//   • platform-progress-vs-deadline projection
//   • next 3 milestones (links)
//   • collapsible "sobre a competição" (phase descriptions, evaluation
//     criteria, source link)
//
// Replaces the standalone SchedulePanel route; reuses poster tokens.
// ──────────────────────────────────────────────────────────────────

const BUILD_TO_FASE = { mission: 'fase1', hardware: 'fase2', firmware: 'fase2', testing: 'fase2', telemetry: 'fase3' }
const LIGHT_COLOR = { green: 'var(--ok2)', amber: 'var(--warn2)', red: 'var(--err2)' }

function trafficLight(status, plan, schedule, phaseState) {
  const today = todayOffset(schedule?.startDate)
  const deadlineDay = schedule?.deadlineDay || 60
  const doneCount = Object.values(status).filter(s => s.done).length
  const total = Object.keys(status).length
  const pctDone = total > 0 ? doneCount / total : 0

  // expected linear pace: how far through the deadline are we?
  const pctTime = deadlineDay > 0 ? Math.min(1, today / deadlineDay) : 0

  // any phase late per schedule?
  const hasLate = Object.keys(status).some(id => {
    const health = phaseScheduleState(id, plan, {
      confirmed: phaseState?.[id]?.confirmed,
      confirmedAt: phaseState?.[id]?.confirmedAt,
      startISO: schedule?.startDate,
    })
    return health === 'late'
  })

  if (hasLate || (pctTime > 0.6 && pctDone < pctTime * 0.4)) return 'red'
  if (pctTime > 0.3 && pctDone < pctTime * 0.7) return 'amber'
  return 'green'
}

function daysRemaining(schedule) {
  if (!schedule?.startDate) return null
  const today = todayOffset(schedule.startDate)
  const remaining = (schedule.deadlineDay || 60) - today
  return remaining
}

function currentOBSatPhase(status) {
  const currentBuild = ['telemetry', 'testing', 'firmware', 'hardware', 'mission'].find(id => status[id]?.current) || 'mission'
  return BUILD_TO_FASE[currentBuild] || 'fase1'
}

export function ObsatCompact({ collapsed }) {
  const store = useForge()
  const fw = getFramework(store.missionPlan.frameworkId) || OBSAT
  const { status } = derivePhases(store)
  const plan = resolveSchedule(store.schedule)
  const light = trafficLight(status, plan, store.schedule, store.phaseState)
  const remaining = daysRemaining(store.schedule)
  const faseId = currentOBSatPhase(status)
  const fase = (fw.timeline || OBSAT.timeline).find(t => t.id === faseId)

  const [detailOpen, setDetailOpen] = useState(false)

  if (collapsed) {
    return (
      <button onClick={() => setDetailOpen(o => !o)} title={`OBSAT · ${fase?.phase || faseId} · ${remaining != null ? remaining + 'd' : '—'}`}
        style={{ position: 'relative', width: 34, height: 34, borderRadius: 7, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: detailOpen ? 'var(--rail-active-bg)' : 'transparent', color: 'var(--rail-fg)' }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: LIGHT_COLOR[light], boxShadow: `0 0 6px ${LIGHT_COLOR[light]}` }} />
        {detailOpen && <div style={{ position: 'absolute', left: 40, bottom: 0, zIndex: 60 }}><ObsatDetail fw={fw} status={status} plan={plan} schedule={store.schedule} phaseState={store.phaseState} faseId={faseId} remaining={remaining} floating /></div>}
      </button>
    )
  }

  return (
    <div style={{ padding: '8px 12px' }}>
      <button onClick={() => setDetailOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 8px', border: '1px solid var(--rail-line)', borderRadius: 7, cursor: 'pointer', background: detailOpen ? 'var(--rail-active-bg)' : 'transparent' }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: LIGHT_COLOR[light], boxShadow: `0 0 6px ${LIGHT_COLOR[light]}` }} />
        <span style={{ flex: 1, textAlign: 'left' }}>
          <span style={{ ...mono, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--rail-fg-dim)', display: 'block' }}>OBSAT</span>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, color: 'var(--rail-fg)', fontWeight: 600 }}>{fase ? fase.phase.split(' · ')[1] || fase.phase : faseId}</span>
        </span>
        <span style={{ ...mono, fontSize: 11, color: 'var(--rail-fg-dim)' }}>{remaining != null ? `${remaining}d` : '—'}</span>
        <span style={{ ...mono, fontSize: 11, color: 'var(--rail-fg-dim)', transform: detailOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
      </button>

      {detailOpen && (
        <ObsatDetail fw={fw} status={status} plan={plan} schedule={store.schedule} phaseState={store.phaseState} faseId={faseId} remaining={remaining} />
      )}
    </div>
  )
}

// Section label in the SAME style as the rest of the sidebar (ORÇAMENTOS,
// COLABORAÇÃO): small-caps, muted, no background.
const railLabel = { ...mono, fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--rail-fg-dim)' }

function ObsatDetail({ fw, status, plan, schedule, phaseState, faseId, remaining, floating }) {
  const [aboutOpen, setAboutOpen] = useState(false)
  const timeline = fw.timeline || OBSAT.timeline
  const today = todayOffset(schedule?.startDate)
  const doneCount = Object.values(status).filter(s => s.done).length
  const total = Object.keys(status).length
  const curIdx = timeline.findIndex(t => t.id === faseId)

  const upcoming = Object.entries(status)
    .filter(([, v]) => !v.done)
    .sort((a, b) => (plan[a[0]]?.[0] || 0) - (plan[b[0]]?.[0] || 0))
    .slice(0, 3)

  // floating (collapsed rail) needs a surface; inline sits in the sidebar
  // flow with just a top divider — the platform's standard section pattern.
  const wrap = floating
    ? { marginTop: 6, background: 'var(--rail-bg)', border: '1px solid var(--rail-line)', borderRadius: 6, padding: '10px 12px', width: 248, maxHeight: 460, overflowY: 'auto' }
    : { marginTop: 10, borderTop: '1px solid var(--rail-line)', paddingTop: 12 }

  return (
    <div style={wrap}>
      <div style={{ ...railLabel, marginBottom: 9 }}>cronograma OBSAT</div>

      {/* phase list — one compact line each, current uses the accent */}
      <div style={{ marginBottom: 12 }}>
        {timeline.map((t, i) => {
          const here = i === curIdx
          const past = curIdx >= 0 && i < curIdx
          return (
            <div key={t.id || t.phase} style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '3px 0' }}>
              <span style={{ flexShrink: 0, width: 10, height: 10, borderRadius: '50%', marginTop: 3, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: here ? 'var(--rail-active-fg)' : 'transparent',
                border: `1.5px solid ${here ? 'var(--rail-active-fg)' : past ? 'var(--rail-fg-dim)' : 'var(--rail-line)'}` }}>
                {past && <span style={{ fontSize: 7, color: 'var(--rail-fg-dim)', lineHeight: 1 }}>✓</span>}
              </span>
              <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, color: here ? 'var(--rail-active-fg)' : 'var(--rail-fg)', fontWeight: here ? 700 : 500 }}>{t.phase}</span>
              <span style={{ ...mono, fontSize: 9.5, color: 'var(--rail-fg-dim)' }}>{t.when}</span>
            </div>
          )
        })}
      </div>

      {/* progress vs deadline — two single lines, no bars */}
      <div style={{ marginBottom: 12, ...mono, fontSize: 11, color: 'var(--rail-fg)', lineHeight: 1.7 }}>
        <div>fases concluídas <span style={{ color: 'var(--rail-fg-dim)' }}>{doneCount}/{total}</span></div>
        <div>tempo decorrido <span style={{ color: 'var(--rail-fg-dim)' }}>{today} dia{today === 1 ? '' : 's'}{remaining != null ? ` · ${remaining}d restantes` : ''}</span></div>
      </div>

      {/* upcoming milestones — simple bulleted list */}
      {upcoming.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ ...railLabel, marginBottom: 5 }}>próximos marcos</div>
          {upcoming.map(([id]) => {
            const health = phaseScheduleState(id, plan, { confirmed: phaseState?.[id]?.confirmed, confirmedAt: phaseState?.[id]?.confirmedAt, startISO: schedule?.startDate })
            const lateColor = health === 'late' ? 'var(--err2)' : 'var(--rail-fg-dim)'
            return (
              <div key={id} style={{ display: 'flex', alignItems: 'baseline', gap: 7, padding: '2px 0' }}>
                <span style={{ ...mono, fontSize: 11, color: 'var(--rail-fg-dim)' }}>·</span>
                <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, color: 'var(--rail-fg)', flex: 1, textTransform: 'capitalize' }}>{id}</span>
                {health === 'late' && <span style={{ ...mono, fontSize: 9.5, color: lateColor }}>atrasado</span>}
              </div>
            )
          })}
        </div>
      )}

      {/* "sobre a competição" — collapsible, sidebar tokens */}
      <div style={{ borderTop: '1px solid var(--rail-line)', paddingTop: 10 }}>
        <button onClick={() => setAboutOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
          <span style={railLabel}>sobre a competição</span>
          <span style={{ flex: 1 }} />
          <span style={{ ...mono, fontSize: 10, color: 'var(--rail-fg-dim)' }}>{aboutOpen ? '−' : '+'}</span>
        </button>
        {aboutOpen && (
          <div style={{ marginTop: 9 }}>
            <div style={{ ...mono, fontSize: 11, color: 'var(--rail-fg)', lineHeight: 1.6, marginBottom: 8 }}>{fw.description || OBSAT.description}</div>
            <div style={{ ...mono, fontSize: 10, color: 'var(--rail-fg-dim)', marginBottom: 8, lineHeight: 1.5 }}>{fw.asOf || OBSAT.asOf}</div>
            {(fw.scoring || OBSAT.scoring)?.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ ...railLabel, marginBottom: 6 }}>critérios de avaliação</div>
                {(fw.scoring || OBSAT.scoring).map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, ...mono, fontSize: 11, color: 'var(--rail-fg)', padding: '2px 0' }}>
                    <span style={{ flex: 1 }}>{s.criterion}</span>
                    <span style={{ color: 'var(--rail-fg-dim)' }}>{s.weight}%</span>
                  </div>
                ))}
                <div style={{ ...mono, fontSize: 9.5, color: 'var(--rail-fg-dim)', marginTop: 5 }}>pesos ilustrativos — confirme no edital oficial</div>
              </div>
            )}
            <a href={fw.sourceUrl || OBSAT.sourceUrl} target="_blank" rel="noreferrer" style={{ ...mono, fontSize: 10.5, color: 'var(--rail-active-fg)', display: 'inline-block', marginTop: 2 }}>fonte oficial ↗</a>
          </div>
        )}
      </div>
    </div>
  )
}
