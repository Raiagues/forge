import useForge, { COMPONENT_DEFS } from '../../store/useForge'
import { buildPhaseReview, SOURCE_LABEL } from '../../mission/index.js'
import BudgetMeters from '../ui/BudgetMeters'
import { mono, slab, CREAM, GOLD } from '../onboarding/posterKit.jsx'

// ──────────────────────────────────────────────────────────────────
// PhaseReview — the mission-readiness review between phases (Part 6).
//
// Shown when the user is about to advance. It summarizes what was decided
// or built, surfaces unresolved warnings/violations and the budget status
// across all four meters, and offers two choices: go back to review, or
// confirm and advance. The language is a readiness gate ("systems
// nominal, ready to proceed"), not a confirm dialog. A larger satellite
// emblem reinforces the build narrative.
// ──────────────────────────────────────────────────────────────────

function ReadinessEmblem({ nominal }) {
  const tone = nominal ? 'var(--ok2)' : 'var(--warn2)'
  return (
    <svg viewBox="0 0 120 120" width="108" height="108" aria-hidden="true" style={{ color: CREAM }}>
      <circle cx="60" cy="60" r="54" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="1.5" />
      <circle cx="60" cy="60" r="44" fill="none" stroke="currentColor" strokeOpacity=".5" strokeWidth="1" strokeDasharray="3 4" />
      {/* satellite */}
      <rect x="48" y="44" width="24" height="32" rx="2" fill="currentColor" fillOpacity=".08" stroke="currentColor" strokeWidth="1.5" />
      <rect x="28" y="50" width="16" height="20" fill="currentColor" fillOpacity=".12" stroke="currentColor" strokeWidth="1.2" />
      <rect x="76" y="50" width="16" height="20" fill="currentColor" fillOpacity=".12" stroke="currentColor" strokeWidth="1.2" />
      <line x1="60" y1="44" x2="60" y2="34" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="60" cy="32" r="3" fill={GOLD} />
      {/* status light */}
      <circle cx="60" cy="92" r="5" fill={tone}>
        <animate attributeName="opacity" values="1;.3;1" dur="1.6s" repeatCount="indefinite" />
      </circle>
    </svg>
  )
}

export default function PhaseReview() {
  const store = useForge()
  const phaseReview = store.phaseReview
  if (!phaseReview) return null

  const review = buildPhaseReview(phaseReview, {
    defs: COMPONENT_DEFS,
    missionPlan: store.missionPlan,
    entities: store.entities,
    live: store.live,
    hwtest: store.hwtest,
  })

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 180, background: 'rgba(12,18,30,.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={store.closePhaseReview}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(640px, 100%)', maxHeight: '90vh', overflowY: 'auto', borderRadius: 14,
        background: 'var(--poster-bg)', border: '1.5px solid var(--poster-line)', padding: '26px 30px 24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 18 }}>
          <ReadinessEmblem nominal={review.nominal} />
          <div style={{ minWidth: 0 }}>
            <div style={{ ...mono, fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: GOLD, marginBottom: 6 }}>revisão de prontidão</div>
            <div style={{ ...slab, fontSize: 24, fontWeight: 700, color: CREAM, lineHeight: 1.1 }}>{review.headline}</div>
          </div>
        </div>

        {/* decisions summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 18 }}>
          {review.decisions.map(([k, val], i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
              <span style={{ ...mono, fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--poster-fg-dim)', width: 120, flexShrink: 0 }}>{k}</span>
              <span style={{ fontSize: 14, color: CREAM, lineHeight: 1.45 }}>{val}</span>
            </div>
          ))}
        </div>

        {/* budget status */}
        <div style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--poster-line)', background: 'var(--poster-card)', marginBottom: 16 }}>
          <BudgetMeters showFormat={false} />
        </div>

        {/* unresolved issues */}
        {review.issues.length > 0 ? (
          <div style={{ marginBottom: 18 }}>
            <div style={{ ...mono, fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--poster-fg-dim)', marginBottom: 8 }}>pendências</div>
            {review.issues.map((iss, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-start' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: iss.severity === 'error' ? 'var(--err2)' : 'var(--warn2)' }} />
                <div>
                  <span style={{ ...mono, fontSize: 9.5, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--poster-fg-dim)', marginRight: 6 }}>{SOURCE_LABEL[iss.source] || iss.source}</span>
                  <span style={{ fontSize: 13.5, color: CREAM }}>{iss.title}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ ...mono, fontSize: 12, color: 'var(--ok2)', marginBottom: 18 }}>✓ nenhuma pendência crítica</div>
        )}

        {/* actions */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', alignItems: 'center' }}>
          <button onClick={store.closePhaseReview} style={{ ...mono, fontSize: 13, color: 'var(--poster-fg-dim)', background: 'none', border: 'none', cursor: 'pointer' }}>← revisar</button>
          <button onClick={store.confirmPhaseReview} style={{
            ...slab, fontSize: 15, fontWeight: 700, color: 'var(--poster-bg-solid)',
            background: review.nominal ? GOLD : 'var(--warn2)', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer',
          }}>
            {!review.nextPhase
              ? 'Concluir →'
              : review.nominal
                ? `Confirmar e avançar para ${review.nextPhase.label} →`
                : 'Avançar mesmo assim →'}
          </button>
        </div>
      </div>
    </div>
  )
}
