// ──────────────────────────────────────────────────────────────────
// Budget engine — the four CONSTRAINT METERS that make the build feel
// like an engineering tradeoff, not a form (Part 3 of the redesign).
//
// Given the chosen satellite format + the placed components, it produces
// four meters — mass (g), volume (cm³), power (mW), financial (R$) —
// each as { used, limit, pct, over, near }. The UI renders these as
// constraint meters (colour shift near the limit, visual overflow when
// exceeded), and a per-component DELTA preview lets the user see a part's
// contribution to every meter BEFORE adding it.
//
// Limits:
//  · mass / volume → official OBSat format table (frameworks.js). ✅
//  · power         → a FORGE design GUIDELINE (no official OBSat number).⚠️
//  · financial     → the user's own budget (optional).
//
// Pure: catalog (`defs`) injected; no store/UI imports.
// ──────────────────────────────────────────────────────────────────

import { effectiveProps, economics } from './validation.js'
import { getObsatFormat } from './frameworks.js'

// ⚠️ DESIGN GUIDELINE, not an OBSat rule. A 1S LiPo (3.7 V) must sustain the
// 2 h telemetry window, so a high instantaneous draw is a risk worth flagging
// per format envelope. Tune freely — clearly not from the edital.
export const POWER_GUIDELINE_MW = { cubesat: 3700, cansat: 3000, pocketqube: 2000 }

// usable internal volume is a fraction of the outer envelope (walls, standoffs,
// battery, structure). 0.55 is a deliberate, conservative packing estimate.
const USABLE_VOLUME_FRACTION = 0.55

const voltsOf = (def) => parseFloat(String(def.voltage)) || 3.3

// instantaneous power draw of a part in mW (override-aware current).
export function componentPowerMw(def, override) {
  if (!def) return 0
  const cur = override?.current ?? def.current ?? 0   // mA
  return Math.round(cur * voltsOf(def))
}

export const componentVolumeCm3 = (def) => (def && def.volumeCm3) || 0

// outer envelope volume of a format in cm³ (box or cylinder).
export function formatEnvelopeCm3(fmt) {
  const [a, b, c] = fmt.sizeMm || [0, 0, 0]
  const mm3 = fmt.cylinder
    ? Math.PI * (a / 2) * (c / 2) * b   // cylinder: a,c ≈ diameter, b ≈ height
    : a * b * c
  return mm3 / 1000
}

// one meter. `near` defaults to 85% of the limit.
function meter(used, limit, { nearFrac = 0.85 } = {}) {
  const u = Math.round(used * 10) / 10
  const pct = limit > 0 ? u / limit : 0
  return {
    used: u, limit,
    pct: Math.min(1.5, pct),            // capped for the bar; `over` carries truth
    over: limit > 0 && u > limit,
    near: limit > 0 && u > limit * nearFrac && u <= limit,
  }
}

// Compute all four meters for a design.
export function computeBudgets({
  defs, componentIds = [], overrides = {}, formatId = 'cubesat', budgetBRL = null,
}) {
  const fmt = getObsatFormat(formatId)
  const eco = economics({ defs, componentIds, overrides })
  let volumeCm3 = 0, powerMw = 0
  for (const id of componentIds) {
    const def = defs[id]; if (!def) continue
    volumeCm3 += componentVolumeCm3(def)
    powerMw += componentPowerMw(def, overrides[id])
  }
  const usableVol = Math.round(formatEnvelopeCm3(fmt) * USABLE_VOLUME_FRACTION)

  return {
    formatId: fmt.id, formatLabel: fmt.label,
    mass:   { ...meter(eco.massG, fmt.massMaxG),                      unit: 'g',   label: 'Massa' },
    volume: { ...meter(volumeCm3, usableVol),                        unit: 'cm³', label: 'Volume' },
    power:  { ...meter(powerMw, POWER_GUIDELINE_MW[fmt.id] || 3700), unit: 'mW',  label: 'Potência', guideline: true },
    cost:   { ...meter(eco.priceBRL, budgetBRL || 0),                unit: 'R$',  label: 'Orçamento', optional: !budgetBRL },
  }
}

// Any meter exceeded? (drives the "blocks forward progress" rule in the
// phase-review screens — Part 6).
export const budgetsOver = (budgets) =>
  !!budgets && ['mass', 'volume', 'power', 'cost'].some(k => budgets[k]?.over && !budgets[k]?.optional)

// Contribution of a single candidate part to each meter — for the hover/
// select DELTA preview before the part is added.
export function budgetDelta({ defs, compId, overrides = {} }) {
  const def = defs[compId]
  if (!def) return null
  const p = effectiveProps(def, overrides[compId])
  return {
    massG: p.mass,
    volumeCm3: componentVolumeCm3(def),
    powerMw: componentPowerMw(def, overrides[compId]),
    priceBRL: p.price,
  }
}
