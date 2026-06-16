import useForge from '../../store/useForge'
import { OBSAT, getFramework, derivePhases } from '../../mission/index.js'
import { mono, slab, CREAM, GOLD, NAVY_FIELD } from '../onboarding/posterKit.jsx'
import GanttChart from './GanttChart'
import WeeklyAvailabilityGrid from './WeeklyAvailabilityGrid'

// ──────────────────────────────────────────────────────────────────
// SchedulePanel — the OBSAT competition timeline (Part 7).
//
// Maps the official OBSAT phases onto a simple visual timeline and marks
// where the team's current build phase sits relative to them. Clean and
// secondary — a reference tool, not the main work area. Exact cronograma
// dates are flagged (see OBSAT.asOf): the edital's dated schedule isn't
// consolidated in the public wiki yet.
// ──────────────────────────────────────────────────────────────────

const CLS_COLOR = { ok: 'var(--ok2)', warn: 'var(--poster-gold)', info: 'var(--poster-fg-dim)' }

// build phase → which OBSAT fase the team is effectively working in
const BUILD_TO_FASE = { mission: 'fase1', hardware: 'fase2', firmware: 'fase2', testing: 'fase2', telemetry: 'fase3' }

export default function SchedulePanel() {
  const store = useForge()
  const fw = getFramework(store.missionPlan.frameworkId) || OBSAT
  const timeline = fw.timeline || OBSAT.timeline
  const { status } = derivePhases(store)
  const currentBuild = ['telemetry', 'testing', 'firmware', 'hardware', 'mission'].find(id => status[id]?.current) || 'mission'
  const hereFase = BUILD_TO_FASE[currentBuild]
  const showAvailability = useForge(s => s.showAvailability)
  const toggleAvailability = useForge(s => s.toggleAvailability)
  const team = store.teams?.find(t => t.id === store.activeTeamId)

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: NAVY_FIELD, padding: '26px 34px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ ...mono, fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: GOLD, marginBottom: 6 }}>cronograma · {fw.edition || fw.name}</div>
        <div style={{ ...slab, fontSize: 28, fontWeight: 700, color: CREAM, marginBottom: 4 }}>Fases da competição</div>
        <div style={{ ...mono, fontSize: 11.5, color: 'var(--poster-fg-dim)', marginBottom: 26, lineHeight: 1.5 }}>
          {fw.asOf || 'dados da competição'} · <a href={fw.sourceUrl} target="_blank" rel="noreferrer" style={{ color: GOLD }}>fonte</a>
        </div>

        {/* interactive project Gantt (Prompt B Part 3) */}
        <GanttChart />

        {/* weekly team-availability overlay toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '24px 0 10px' }}>
          <button onClick={toggleAvailability}
            style={{ ...mono, fontSize: 11, padding: '5px 12px', borderRadius: 5, cursor: 'pointer',
              border: showAvailability ? `1.5px solid ${GOLD}` : '1px solid var(--poster-line)',
              background: showAvailability ? 'var(--poster-card-sel)' : 'transparent',
              color: showAvailability ? GOLD : 'var(--poster-fg-dim)' }}>
            {showAvailability ? 'ocultar disponibilidade' : 'disponibilidade da equipe'}
          </button>
        </div>
        {showAvailability && team?.members?.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <WeeklyAvailabilityGrid team={team} poster />
          </div>
        )}
        {showAvailability && (!team?.members?.length) && (
          <div style={{ ...mono, fontSize: 11.5, color: 'var(--poster-fg-dim)', marginBottom: 28 }}>
            Entre com uma conta e tenha uma equipe para configurar a disponibilidade.
          </div>
        )}

        {/* competition reference timeline */}
        <div style={{ ...slab, fontSize: 20, fontWeight: 700, color: CREAM, marginBottom: 14 }}>Marcos da competição</div>

        {/* visual timeline */}
        <div style={{ position: 'relative', paddingLeft: 28 }}>
          <div style={{ position: 'absolute', left: 9, top: 6, bottom: 6, width: 2, background: 'var(--poster-line)' }} />
          {timeline.map((t) => {
            const here = t.id === hereFase
            return (
              <div key={t.id || t.phase} style={{ position: 'relative', marginBottom: 22 }}>
                <span style={{ position: 'absolute', left: -27, top: 2, width: 18, height: 18, borderRadius: '50%',
                  background: here ? GOLD : 'var(--poster-bg-solid)', border: `2px solid ${here ? GOLD : (CLS_COLOR[t.cls] || 'var(--poster-line)')}`,
                  boxShadow: here ? '0 0 0 4px rgba(201,162,39,.18)' : 'none' }} />
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ ...slab, fontSize: 17, fontWeight: 700, color: CREAM }}>{t.phase}</span>
                  <span style={{ ...mono, fontSize: 12, color: CLS_COLOR[t.cls] || 'var(--poster-fg-dim)' }}>{t.when}</span>
                  {here && <span style={{ ...mono, fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--poster-bg-solid)', background: GOLD, borderRadius: 3, padding: '2px 7px' }}>você está aqui</span>}
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ ...mono, fontSize: 11, color: 'var(--poster-fg-dim)', lineHeight: 1.6, marginTop: 8, padding: '10px 12px', border: '1px dashed var(--poster-line)', borderRadius: 8 }}>
          ⚠️ As datas exatas do cronograma são definidas no edital de cada edição — confirme os prazos oficiais antes de planejar as entregas.
        </div>

        {/* evaluation criteria */}
        {fw.scoring?.length > 0 && (
          <div style={{ marginTop: 30 }}>
            <div style={{ ...slab, fontSize: 18, fontWeight: 700, color: CREAM, marginBottom: 12 }}>Critérios de avaliação</div>
            {fw.scoring.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, color: CREAM, marginBottom: 3 }}>{s.criterion}</div>
                  <div style={{ height: 5, background: 'var(--poster-line)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${s.weight}%`, height: '100%', background: GOLD }} />
                  </div>
                </div>
                <span style={{ ...mono, fontSize: 12, color: GOLD, width: 36, textAlign: 'right' }}>{s.weight}%</span>
              </div>
            ))}
            <div style={{ ...mono, fontSize: 10.5, color: 'var(--poster-fg-dim)', marginTop: 8 }}>pesos ilustrativos — confirme no edital oficial</div>
          </div>
        )}
      </div>
    </div>
  )
}
