// ──────────────────────────────────────────────────────────────────
// Validation engine — evaluates declarative requirement rules against
// the current design and returns structured issues with explanations,
// suggested fixes, a SOURCE (where the rule originates) and TARGETS
// (which components the issue points at) so the UI can render feedback
// inline on the affected hardware instead of burying it in text panels.
//
// Sources: 'competition' | 'objective' | 'budget' | 'comm'
//        | 'dependency' | 'wiring'
//
// Pure: catalog (`defs`) is injected.
// ──────────────────────────────────────────────────────────────────

import {
  capsOf, defsForIds, hasCapability, byCategory,
  componentsWithCapability, capLabel,
} from './capabilities.js'

export const SOURCE_LABEL = {
  competition: 'competição',
  objective: 'objetivo',
  budget: 'orçamento',
  comm: 'comunicação',
  dependency: 'dependência',
  wiring: 'fiação',
}

// Effective (override-aware) physical/economic properties of a part.
export function effectiveProps(def, override = {}) {
  return {
    mass: override.mass ?? def.mass ?? 0,
    price: override.price ?? def.price ?? 0,
    current: override.current ?? def.current ?? 0,
  }
}

// Mission economics: totals over the placed set, honouring user overrides.
export function economics({ defs, componentIds = [], overrides = {} }) {
  let massG = 0, priceBRL = 0, currentmA = 0
  for (const id of componentIds) {
    const def = defs[id]
    if (!def) continue
    const p = effectiveProps(def, overrides[id])
    massG += p.mass; priceBRL += p.price; currentmA += p.current
  }
  return { massG, priceBRL, currentmA }
}

// Expand `suggest` entries (component ids OR capability names) into
// concrete { id, label, reason } fixes. Coming-soon parts are skipped —
// we never suggest hardware the user cannot actually add yet.
function resolveSuggestions(defs, suggest = []) {
  const out = []
  const seen = new Set()
  const usable = (d) => d && !d.comingSoon
  for (const s of suggest) {
    if (defs[s]) {
      if (usable(defs[s]) && !seen.has(s)) { seen.add(s); out.push({ id: s, label: defs[s].label }) }
    } else {
      for (const d of componentsWithCapability(defs, s).filter(usable).slice(0, 2)) {
        if (!seen.has(d.id)) { seen.add(d.id); out.push({ id: d.id, label: d.label, reason: capLabel(s) }) }
      }
    }
  }
  return out
}

function evalRule(rule, { defs, design, overrides }) {
  switch (rule.kind) {
    case 'capability': {
      const caps = Array.isArray(rule.capability) ? rule.capability : [rule.capability]
      const mode = rule.mode || 'any'
      const present = caps.filter((c) => hasCapability(design, c))
      const ok = mode === 'all' ? present.length === caps.length : present.length > 0
      if (ok) return null
      const missing = caps.filter((c) => !present.includes(c)).map(capLabel)
      return {
        title: rule.title, detail: rule.detail,
        missing, suggestions: resolveSuggestions(defs, rule.suggest),
        targets: design.filter((d) => d.category === 'mcu').map((d) => d.id),
      }
    }
    case 'system': {
      const ok = byCategory(design, rule.category).length > 0
      if (ok) return null
      return { title: rule.title, detail: rule.detail, suggestions: resolveSuggestions(defs, rule.suggest), targets: [] }
    }
    case 'count': {
      const found = byCategory(design, rule.category)
      const n = found.length
      const under = rule.min != null && n < rule.min
      const over = rule.max != null && n > rule.max
      if (!under && !over) return null
      const detail = over
        ? `${rule.detail} (encontrados ${n}, máximo ${rule.max}).`
        : `${rule.detail} (encontrados ${n}, mínimo ${rule.min}).`
      return {
        title: rule.title, detail,
        suggestions: under ? resolveSuggestions(defs, rule.suggest) : [],
        targets: over ? found.map((d) => d.id) : [],
      }
    }
    case 'mass': {
      let m = 0
      for (const d of design) m += effectiveProps(d, overrides?.[d.id]).mass
      if (rule.maxG == null || m <= rule.maxG) return null
      return {
        title: rule.title,
        detail: `${rule.detail} Massa atual: ${m} g (limite ${rule.maxG} g).`,
        suggestions: [],
        metric: { massG: m, maxG: rule.maxG },
        targets: design.map((d) => d.id),
      }
    }
    default:
      return null
  }
}

function summarize(issues, rulesCount, eco) {
  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warn')
  const infos = issues.filter((i) => i.severity === 'info')
  return {
    ok: errors.length === 0,
    issues, errors, warnings, infos,
    summary: {
      rules: rulesCount, passed: Math.max(0, rulesCount - issues.length),
      errors: errors.length, warnings: warnings.length, infos: infos.length,
      components: eco?.components ?? 0,
      massG: eco?.massG ?? 0, priceBRL: eco?.priceBRL ?? 0, currentmA: eco?.currentmA ?? 0,
    },
  }
}

// Legacy single-framework validation (kept for the copilot engine).
export function validateDesign({ defs, framework, componentIds = [] }) {
  const design = defsForIds(defs, componentIds)
  const rules = (framework && framework.requirements) || []
  const issues = []
  for (const rule of rules) {
    const res = evalRule(rule, { defs, design, overrides: {} })
    if (res) issues.push({ ruleId: rule.id, severity: rule.severity || 'warn', source: rule.source || 'competition', ...res })
  }
  const eco = economics({ defs, componentIds })
  return summarize(issues, rules.length, { ...eco, components: design.length })
}

// ── live validation ────────────────────────────────────────────────
// Composes everything that should feel "alive" while building:
// competition rules + objective rules + budget + wiring + dependencies.
export function validateLive({
  defs, framework = null, objective = null,
  componentIds = [], overrides = {}, budgetBRL = null,
  pinIssues = [], softwareIds = [], modules = [],
  massMaxG = null,   // chosen-format mass limit; overrides any mass rule's maxG
}) {
  const design = defsForIds(defs, componentIds)
  const issues = []
  let rulesCount = 0

  // 1. competition requirements (incl. comm rules tagged source:'comm').
  // A mass rule's limit is made format-aware: the selected satellite format
  // (CubeSat/CanSat/PocketQube) sets the real mass budget (see budgets.js).
  for (const rule of (framework?.requirements || [])) {
    rulesCount++
    const effRule = rule.kind === 'mass' && massMaxG != null ? { ...rule, maxG: massMaxG } : rule
    const res = evalRule(effRule, { defs, design, overrides })
    if (res) issues.push({ ruleId: rule.id, severity: rule.severity || 'warn', source: rule.source || 'competition', ...res })
  }

  // 2. objective requirements
  for (const rule of (objective?.requirements || [])) {
    rulesCount++
    const res = evalRule(rule, { defs, design, overrides })
    if (res) issues.push({ ruleId: rule.id, severity: rule.severity || 'warn', source: 'objective', ...res })
  }

  // 3. budget (price vs user-defined budget)
  const eco = economics({ defs, componentIds, overrides })
  if (budgetBRL != null && budgetBRL > 0) {
    rulesCount++
    if (eco.priceBRL > budgetBRL) {
      issues.push({
        ruleId: 'budget-cost', severity: 'error', source: 'budget',
        title: 'Orçamento estourado',
        detail: `Custo total R$ ${eco.priceBRL} acima do orçamento de R$ ${budgetBRL}.`,
        suggestions: [], targets: componentIds.filter((id) => defs[id]),
      })
    } else if (eco.priceBRL > budgetBRL * 0.85) {
      issues.push({
        ruleId: 'budget-cost-near', severity: 'warn', source: 'budget',
        title: 'Perto do limite do orçamento',
        detail: `Custo total R$ ${eco.priceBRL} já usa ${Math.round((eco.priceBRL / budgetBRL) * 100)}% do orçamento de R$ ${budgetBRL}.`,
        suggestions: [], targets: [],
      })
    }
  }

  // 4. wiring issues from the pin engine
  for (const w of pinIssues) {
    issues.push({ ruleId: `wiring-${issues.length}`, suggestions: [], ...w })
  }

  // 5. software ↔ hardware dependency coherence
  const byId = Object.fromEntries(modules.map((m) => [m.id, m]))
  for (const id of softwareIds) {
    const mod = byId[id]
    if (!mod) continue
    const missing = (mod.requires || []).filter((c) => !hasCapability(design, c))
    if (missing.length) {
      issues.push({
        ruleId: `dep-${id}`, severity: 'warn', source: 'dependency',
        title: `${mod.label} sem hardware`,
        detail: `O módulo "${mod.label}" requer ${missing.map(capLabel).join(', ')}, mas nenhum componente fornece isso.`,
        suggestions: resolveSuggestions(defs, missing), targets: [],
      })
    }
  }

  return summarize(issues, rulesCount, { ...eco, components: design.length })
}

// Issues that point at one specific component (for inline chip feedback).
export function issuesForComponent(validation, compId) {
  if (!validation) return []
  return validation.issues.filter((i) => (i.targets || []).includes(compId))
}

// Software/hardware coherence (legacy export used by the copilot).
export function validateSoftware({ defs, componentIds = [], moduleIds = [], modules = [] }) {
  const design = defsForIds(defs, componentIds)
  const byId = Object.fromEntries(modules.map((m) => [m.id, m]))
  const issues = []
  for (const id of moduleIds) {
    const mod = byId[id]
    if (!mod) continue
    const missing = (mod.requires || []).filter((c) => !hasCapability(design, c))
    if (missing.length) {
      issues.push({
        moduleId: id, severity: 'warn',
        title: `${mod.label} sem hardware`,
        detail: `O módulo "${mod.label}" requer ${missing.map(capLabel).join(', ')}, mas nenhum componente fornece isso.`,
        missing: missing.map(capLabel),
      })
    }
  }
  return issues
}

export { capsOf }
