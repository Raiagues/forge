import { useState } from 'react'
import useForge from '../../store/useForge'
import { OBSAT, getFramework, derivePhases } from '../../mission/index.js'
import { resolveSchedule, todayOffset, phaseScheduleState } from '../../mission/schedule.js'
import { mono, slab, CREAM, GOLD, NAVY_FIELD } from '../onboarding/posterKit.jsx'

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
const CLS_COLOR = { ok: 'var(--ok2)', warn: 'var(--poster-gold)', info: 'var(--poster-fg-dim)' }

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
        {detailOpen && <ObsatDetail fw={fw} status={status} plan={plan} schedule={store.schedule} phaseState={store.phaseState} faseId={faseId} light={light} remaining={remaining} />}
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
        <ObsatDetail fw={fw} status={status} plan={plan} schedule={store.schedule} phaseState={store.phaseState} faseId={faseId} light={light} remaining={remaining} />
      )}
    </div>
  )
}

function ObsatDetail({ fw, status, plan, schedule, phaseState, faseId, light, remaining }) {
  const [aboutOpen, setAboutOpen] = useState(false)
  const timeline = fw.timeline || OBSAT.timeline
  const today = todayOffset(schedule?.startDate)
  const deadlineDay = schedule?.deadlineDay || 60
  const doneCount = Object.values(status).filter(s => s.done).length
  const total = Object.keys(status).length

  // projection: expected vs actual
  const pctTime = deadlineDay > 0 ? Math.min(1, today / deadlineDay) : 0
  const pctDone = total > 0 ? doneCount / total : 0

  // next 3 milestones: upcoming phases (not done)
  const upcoming = Object.entries(status)
    .filter(([, v]) => !v.done)
    .sort((a, b) => (plan[a[0]]?.[0] || 0) - (plan[b[0]]?.[0] || 0))
    .slice(0, 3)

  return (
    <div style={{ marginTop: 8, background: NAVY_FIELD, border: '1px solid var(--poster-line)', borderRadius: 9, padding: '14px 14px 12px', maxHeight: 480, overflowY: 'auto' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: LIGHT_COLOR[light], boxShadow: `0 0 6px ${LIGHT_COLOR[light]}` }} />
        <span style={{ ...slab, fontSize: 15, fontWeight: 700, color: CREAM, flex: 1 }}>{fw.edition || fw.name}</span>
        <span style={{ ...mono, fontSize: 11, color: GOLD }}>{remaining != null ? `${remaining}d restantes` : '—'}</span>
      </div>

      {/* traffic light legend */}
      <div style={{ ...mono, fontSize: 10, color: 'var(--poster-fg-dim)', marginBottom: 12, lineHeight: 1.5 }}>
        {light === 'green' && 'Progresso dentro do esperado'}
        {light === 'amber' && 'Progresso abaixo do ritmo esperado'}
        {light === 'red' && 'Fases atrasadas — risco no prazo'}
      </div>

      {/* progress vs deadline projection */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ ...mono, fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--poster-fg-dim)', marginBottom: 6 }}>progresso vs prazo</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <div style={{ ...mono, fontSize: 10, color: 'var(--poster-fg-dim)', marginBottom: 3 }}>fases concluídas</div>
            <div style={{ height: 6, background: 'var(--poster-line)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${pctDone * 100}%`, height: '100%', background: LIGHT_COLOR[light], borderRadius: 3, transition: 'width .3s' }} />
            </div>
            <div style={{ ...mono, fontSize: 10, color: CREAM, marginTop: 2 }}>{doneCount}/{total}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ ...mono, fontSize: 10, color: 'var(--poster-fg-dim)', marginBottom: 3 }}>tempo decorrido</div>
            <div style={{ height: 6, background: 'var(--poster-line)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${pctTime * 100}%`, height: '100%', background: GOLD, borderRadius: 3, transition: 'width .3s' }} />
            </div>
            <div style={{ ...mono, fontSize: 10, color: CREAM, marginTop: 2 }}>dia {today}/{deadlineDay}</div>
          </div>
        </div>
      </div>

      {/* OBSat phase timeline */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ ...mono, fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--poster-fg-dim)', marginBottom: 6 }}>fases da competição</div>
        <div style={{ position: 'relative', paddingLeft: 20 }}>
          <div style={{ position: 'absolute', left: 6, top: 4, bottom: 4, width: 1.5, background: 'var(--poster-line)' }} />
          {timeline.map(t => {
            const here = t.id === faseId
            return (
              <div key={t.id || t.phase} style={{ position: 'relative', marginBottom: 10 }}>
                <span style={{ position: 'absolute', left: -19, top: 2, width: 12, height: 12, borderRadius: '50%',
                  background: here ? GOLD : 'var(--poster-bg-solid)', border: `1.5px solid ${here ? GOLD : (CLS_COLOR[t.cls] || 'var(--poster-line)')}`,
                  boxShadow: here ? '0 0 0 3px rgba(201,162,39,.18)' : 'none' }} />
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ ...slab, fontSize: 12.5, fontWeight: 600, color: CREAM }}>{t.phase}</span>
                  <span style={{ ...mono, fontSize: 10, color: CLS_COLOR[t.cls] || 'var(--poster-fg-dim)' }}>{t.when}</span>
                  {here && <span style={{ ...mono, fontSize: 8, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--poster-bg-solid)', background: GOLD, borderRadius: 2, padding: '1px 5px' }}>atual</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* next 3 milestones */}
      {upcoming.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ ...mono, fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--poster-fg-dim)', marginBottom: 6 }}>próximos marcos</div>
          {upcoming.map(([id]) => {
            const [startDay, endDay] = plan[id] || [0, 0]
            const health = phaseScheduleState(id, plan, { confirmed: phaseState?.[id]?.confirmed, confirmedAt: phaseState?.[id]?.confirmedAt, startISO: schedule?.startDate })
            const healthColor = health === 'late' ? 'var(--err2)' : health === 'ontrack' ? GOLD : health === 'ahead' ? 'var(--ok2)' : 'var(--poster-fg-dim)'
            const healthLabel = { late: 'atrasado', ontrack: 'no prazo', ahead: 'adiantado', done: 'concluído', future: 'a iniciar' }
            return (
              <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: healthColor, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontFamily: "'Space Grotesk', sans-serif", color: CREAM, flex: 1, textTransform: 'capitalize' }}>{id}</span>
                <span style={{ ...mono, fontSize: 10, color: healthColor }}>{healthLabel[health] || health}</span>
                <span style={{ ...mono, fontSize: 10, color: 'var(--poster-fg-dim)' }}>d{startDay}–{endDay}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* collapsible "sobre a competição" */}
      <div style={{ borderTop: '1px solid var(--poster-line)', paddingTop: 10 }}>
        <button onClick={() => setAboutOpen(o => !o)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
          <span style={{ ...mono, fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: GOLD }}>sobre a competição</span>
          <span style={{ ...mono, fontSize: 11, color: 'var(--poster-fg-dim)', transform: aboutOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
        </button>

        {aboutOpen && (
          <div style={{ marginTop: 10 }}>
            {/* phase descriptions */}
            <div style={{ ...mono, fontSize: 11, color: CREAM, lineHeight: 1.6, marginBottom: 10 }}>
              {fw.description || OBSAT.description}
            </div>
            <div style={{ ...mono, fontSize: 10, color: 'var(--poster-fg-dim)', marginBottom: 10, lineHeight: 1.5 }}>
              {fw.asOf || OBSAT.asOf}
            </div>

            {/* evaluation criteria */}
            {(fw.scoring || OBSAT.scoring)?.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ ...slab, fontSize: 13, fontWeight: 600, color: CREAM, marginBottom: 8 }}>Critérios de avaliação</div>
                {(fw.scoring || OBSAT.scoring).map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11.5, color: CREAM, marginBottom: 2 }}>{s.criterion}</div>
                      <div style={{ height: 4, background: 'var(--poster-line)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${s.weight}%`, height: '100%', background: GOLD }} />
                      </div>
                    </div>
                    <span style={{ ...mono, fontSize: 10, color: GOLD, width: 30, textAlign: 'right' }}>{s.weight}%</span>
                  </div>
                ))}
                <div style={{ ...mono, fontSize: 9.5, color: 'var(--poster-fg-dim)', marginTop: 6 }}>pesos ilustrativos — confirme no edital oficial</div>
              </div>
            )}

            {/* source link */}
            <a href={fw.sourceUrl || OBSAT.sourceUrl} target="_blank" rel="noreferrer"
              style={{ ...mono, fontSize: 10.5, color: GOLD, display: 'inline-block', marginTop: 4 }}>
              fonte oficial ↗
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
