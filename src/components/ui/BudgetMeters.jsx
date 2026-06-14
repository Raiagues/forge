import useForge from '../../store/useForge'
import { OBSAT_FORMAT_LIST } from '../../mission/index.js'

// ──────────────────────────────────────────────────────────────────
// BudgetMeters — the four CONSTRAINT METERS (Part 3 of the redesign).
//
// These are NOT progress bars. They are budgets you spend against: mass,
// volume, power and money. The bar shifts to amber near the limit and to
// red (with visual overflow past the track) when exceeded, so the user
// feels the tradeoff of every component. Reads `live.budgets` straight
// from the store — a pure function of state — so it stays correct on
// every change and can be docked anywhere (Hardware column, the phase
// sidebar in Part 5, the phase-review screens in Part 6).
//
// `delta` (optional) is a per-meter preview contribution { massG, volumeCm3,
// powerMw, priceBRL } shown as a ghost segment + "+n" while the user is
// considering a component — the decision is made with full information.
// ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: "'Space Mono', monospace" }

const fmtUsed = (m) => (m.unit === 'R$' ? `R$ ${m.used}` : `${m.used} ${m.unit}`)
const fmtLimit = (m) => (m.unit === 'R$' ? `${m.limit}` : `${m.limit} ${m.unit}`)

function Meter({ m, deltaVal }) {
  if (!m) return null
  const color = m.over ? 'var(--err2)' : m.near ? 'var(--warn2)' : 'var(--ok2)'
  const noLimit = !m.limit || m.optional
  const basePct = noLimit ? 0 : Math.min(1, m.pct) * 100
  const overPct = m.over ? Math.min(40, (m.pct - 1) * 100) : 0
  // ghost preview segment (the candidate component's contribution)
  const deltaPct = deltaVal && m.limit ? Math.min(100 - basePct, (deltaVal / m.limit) * 100) : 0

  return (
    <div style={{ marginBottom: 9 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
        <span style={{ ...mono, fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink4)' }}>
          {m.label}{m.guideline ? ' ·guia' : ''}
        </span>
        <span style={{ ...mono, fontSize: 11, color: m.over ? 'var(--err2)' : 'var(--ink3)' }}>
          {fmtUsed(m)}
          {deltaVal ? <span style={{ color: 'var(--acc)' }}> +{deltaVal}</span> : null}
          {noLimit ? '' : <span style={{ color: 'var(--ink4)' }}> / {fmtLimit(m)}</span>}
        </span>
      </div>
      <div style={{ position: 'relative', height: 6, background: 'var(--rule)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${basePct}%`, background: color, borderRadius: 3, transition: 'width .35s, background .35s' }} />
        {deltaPct > 0 && (
          <div style={{ position: 'absolute', left: `${basePct}%`, top: 0, bottom: 0, width: `${deltaPct}%`, background: 'var(--acc)', opacity: .4 }} />
        )}
        {/* overflow nub past the track edge — the meter visibly "overflows" */}
        {overPct > 0 && (
          <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: `${overPct}%`, background: 'var(--err2)', opacity: .5 }} />
        )}
      </div>
    </div>
  )
}

// Compact format chooser so the budgets respond to the chosen form factor.
function FormatChooser() {
  const format = useForge(s => s.missionPlan.format)
  const setFormat = useForge(s => s.setFormat)
  const active = format || 'cubesat'
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
      {OBSAT_FORMAT_LIST.map(f => {
        const sel = active === f.id
        return (
          <button key={f.id} onClick={() => setFormat(f.id)} title={`${f.label} · ${f.sizeNote} · ≤ ${f.massMaxG} g`}
            style={{
              flex: 1, padding: '4px 2px', borderRadius: 4, cursor: 'pointer',
              border: `1px solid ${sel ? 'var(--acc)' : 'var(--rule)'}`,
              background: sel ? 'rgba(158,74,44,.08)' : 'var(--paper)',
              ...mono, fontSize: 9.5, letterSpacing: '.04em', textTransform: 'uppercase',
              color: sel ? 'var(--acc)' : 'var(--ink4)',
            }}>{f.id === 'pocketqube' ? 'Pocket' : f.label.replace(' 1U', '')}</button>
        )
      })}
    </div>
  )
}

export default function BudgetMeters({ delta = null, showFormat = true, compact = false }) {
  const budgets = useForge(s => s.live?.budgets)
  if (!budgets) return null
  return (
    <div style={{ padding: compact ? 0 : '2px 0' }}>
      {showFormat && <FormatChooser />}
      <Meter m={budgets.mass}   deltaVal={delta?.massG} />
      <Meter m={budgets.volume} deltaVal={delta?.volumeCm3} />
      <Meter m={budgets.power}  deltaVal={delta?.powerMw} />
      <Meter m={budgets.cost}   deltaVal={delta?.priceBRL} />
    </div>
  )
}
