// ──────────────────────────────────────────────────────────────────
// Validation engine — evaluates a framework's declarative requirement
// rules against the current design (set of component ids + plan) and
// returns structured issues with explanations and suggested fixes.
//
// Pure: catalog (`defs`) is injected.
// ──────────────────────────────────────────────────────────────────

import {
  capsOf, defsForIds, hasCapability, byCategory, totalMass,
  componentsWithCapability, capLabel,
} from './capabilities.js'

// Expand `suggest` entries (component ids OR capability names) into
// concrete { id, label, reason } fixes.
function resolveSuggestions(defs, suggest = []) {
  const out = []
  const seen = new Set()
  for (const s of suggest) {
    if (defs[s]) {
      if (!seen.has(s)) { seen.add(s); out.push({ id: s, label: defs[s].label }) }
    } else {
      // treat as a capability name → first couple of catalog parts that provide it
      for (const d of componentsWithCapability(defs, s).slice(0, 2)) {
        if (!seen.has(d.id)) { seen.add(d.id); out.push({ id: d.id, label: d.label, reason: capLabel(s) }) }
      }
    }
  }
  return out
}

function evalRule(rule, { defs, design }) {
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
      }
    }
    case 'system': {
      const ok = byCategory(design, rule.category).length > 0
      if (ok) return null
      return { title: rule.title, detail: rule.detail, suggestions: resolveSuggestions(defs, rule.suggest) }
    }
    case 'count': {
      const n = byCategory(design, rule.category).length
      const under = rule.min != null && n < rule.min
      const over = rule.max != null && n > rule.max
      if (!under && !over) return null
      const detail = over
        ? `${rule.detail} (encontrados ${n}, máximo ${rule.max}).`
        : `${rule.detail} (encontrados ${n}, mínimo ${rule.min}).`
      return { title: rule.title, detail, suggestions: under ? resolveSuggestions(defs, rule.suggest) : [] }
    }
    case 'mass': {
      const m = totalMass(design)
      if (rule.maxG == null || m <= rule.maxG) return null
      return {
        title: rule.title,
        detail: `${rule.detail} Massa atual: ${m} g (limite ${rule.maxG} g).`,
        suggestions: [],
        metric: { massG: m, maxG: rule.maxG },
      }
    }
    default:
      return null
  }
}

export function validateDesign({ defs, framework, componentIds = [] }) {
  const design = defsForIds(defs, componentIds)
  const rules = (framework && framework.requirements) || []
  const issues = []
  for (const rule of rules) {
    const res = evalRule(rule, { defs, design })
    if (res) issues.push({ ruleId: rule.id, severity: rule.severity || 'warn', ...res })
  }
  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warn')
  const infos = issues.filter((i) => i.severity === 'info')
  const passed = rules.length - issues.length
  return {
    ok: errors.length === 0,
    issues, errors, warnings, infos,
    summary: {
      rules: rules.length, passed,
      errors: errors.length, warnings: warnings.length, infos: infos.length,
      components: design.length, massG: totalMass(design),
    },
  }
}

// Software/hardware coherence: modules whose required capability is absent.
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
