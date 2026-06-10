// ──────────────────────────────────────────────────────────────────
// Recommendation engine.
//
//  • recommend()    — given a plan + framework, suggest parts that fill
//                     gaps (mandatory systems + objective-derived needs).
//  • analyzeText()  — lightweight NL analysis of a free-text mission
//                     description → goals, capabilities and parts.
//  • estimatePower() — rough current/autonomy budget for a part set.
//
// Pure: catalog (`defs`) injected.
// ──────────────────────────────────────────────────────────────────

import {
  defsForIds, hasCapability, componentsWithCapability,
  byCategory, totalCurrent, capLabel,
} from './capabilities.js'

// keyword → capabilities. Drives both objective parsing and NL analysis.
const KEYWORD_MAP = [
  { re: /temperatur|t[ée]rmic|clima|meteoro|atmosf/i, caps: ['temperature'] },
  { re: /press[aã]o|barom|altitude\s*baro/i, caps: ['pressure'] },
  { re: /umidad|higro/i, caps: ['humidity'] },
  { re: /co2|di[óo]xido|gas|g[áa]s|polui|qualidade do ar|voc/i, caps: ['co2', 'air-quality'] },
  { re: /acelera|vibra|movimento|atitude|orienta|imu|giro/i, caps: ['imu'] },
  { re: /gps|gnss|posi[çc][aã]o|trajet[óo]ria|rastre|localiza|geo/i, caps: ['gnss'] },
  { re: /wifi|wi-fi|esta[çc][aã]o base|obsat/i, caps: ['wifi'] },
  { re: /lora|longo alcance|long-range|telemetri.*km|enlace longo/i, caps: ['lora'] },
  { re: /grava|log|backup|cart[aã]o|sd\b|armazena/i, caps: ['storage'] },
]

function capsFromText(text) {
  const caps = new Set()
  for (const { re, caps: cs } of KEYWORD_MAP) if (re.test(text)) cs.forEach((c) => caps.add(c))
  return [...caps]
}

// pick the lightest catalog part that provides a capability
// (coming-soon parts are never recommended — the user can't add them yet)
function partForCapability(defs, cap, excludeIds = []) {
  const cands = componentsWithCapability(defs, cap)
    .filter((d) => !excludeIds.includes(d.id) && !d.comingSoon)
    .sort((a, b) => (a.mass || 0) - (b.mass || 0))
  return cands[0] || null
}

// Recommend parts that fill mandatory + objective-derived capability gaps.
export function recommend({ defs, plan = {}, framework = null }) {
  const have = plan.components || []
  const design = defsForIds(defs, have)
  const text = [...(plan.objectives || []), plan.custom?.description || ''].join(' · ')
  const wantCaps = new Set(capsFromText(text))

  // framework-implied capabilities
  if (framework) {
    for (const r of framework.requirements || []) {
      if (r.kind === 'capability') (Array.isArray(r.capability) ? r.capability : [r.capability]).forEach((c) => wantCaps.add(c))
    }
  }

  const missing = []
  const seen = new Set(have)
  for (const cap of wantCaps) {
    if (hasCapability(design, cap)) continue
    const part = partForCapability(defs, cap, [...seen])
    if (part && !seen.has(part.id)) {
      seen.add(part.id)
      missing.push({ id: part.id, label: part.label, capability: cap, reason: capLabel(cap), category: part.category })
    }
  }

  // ensure core systems (only ones the user can actually add today)
  const ensure = (category, fallbackId) => {
    if (byCategory(design, category).length === 0 && !seen.has(fallbackId)
        && defs[fallbackId] && !defs[fallbackId].comingSoon) {
      seen.add(fallbackId)
      missing.push({ id: fallbackId, label: defs[fallbackId].label, capability: category, reason: category, category })
    }
  }
  ensure('mcu', 'esp32')
  ensure('power', 'lipo_2000')

  return { missing, wantedCapabilities: [...wantCaps] }
}

// NL analysis of a mission description.
export function analyzeText(text = '', defs) {
  const caps = capsFromText(text)
  const seen = new Set()
  const components = []
  for (const cap of caps) {
    const part = partForCapability(defs, cap, [...seen])
    if (part && !seen.has(part.id)) {
      seen.add(part.id)
      components.push({ id: part.id, label: part.label, capability: cap, reason: capLabel(cap) })
    }
  }
  return { capabilities: caps, components }
}

// Rough power budget. Assumes a 2000 mAh pack unless one is in the set.
export function estimatePower({ defs, componentIds = [] }) {
  const design = defsForIds(defs, componentIds)
  const mA = Math.max(1, totalCurrent(design))
  const battery = design.find((d) => d.category === 'power')
  const capacity = (battery && battery.capacity) || 2000
  const hours = capacity / mA
  return { currentmA: mA, capacitymAh: capacity, hours: Number(hours.toFixed(1)) }
}

// Environmental risk heuristics from a description / environment fields.
export function environmentalRisks(text = '') {
  const risks = []
  if (/-?\d+\s*°?\s*c|frio|gelo|baixa temperatura|estratosf|30\s*km|alta altitude/i.test(text))
    risks.push({ title: 'Frio extremo', detail: 'Baixas temperaturas reduzem a capacidade da bateria — preveja isolamento térmico.' })
  if (/v[áa]cuo|baixa press[aã]o|estratosf|suborbital|alta altitude/i.test(text))
    risks.push({ title: 'Baixa pressão', detail: 'Componentes com dissipação ou eletrólitos podem sofrer em baixa pressão.' })
  if (/lan[çc]amento|vibra|impacto|queda|paraqued/i.test(text))
    risks.push({ title: 'Vibração mecânica', detail: 'Garanta fixação mecânica e desacoplamento dos sensores (capacitores, montagem).' })
  if (/wifi|esta[çc][aã]o base/i.test(text) && /km|longo|distante/i.test(text))
    risks.push({ title: 'Alcance de WiFi', detail: 'WiFi tem alcance curto — para longa distância considere também LoRa.' })
  return risks
}
