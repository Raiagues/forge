// ──────────────────────────────────────────────────────────────────
// Mission summary (IMPLEMENTATION_PLAN §4 item 14). PURE: shapes a
// read-only snapshot of a mission for the shareable public page and the
// local preview. The same shape is produced server-side (routes/share.js)
// so the panel renders either source identically. No store/UI imports;
// the component catalog is injected for friendly names.
// ──────────────────────────────────────────────────────────────────
import { PHASES } from './phases.js'

const PHASE_LABEL = Object.fromEntries(PHASES.map(p => [p.id, p.label]))

// Build a summary from a live store snapshot (used for the local preview
// before/without sharing). Mirrors the server `summary` payload shape.
export function buildSummary(state = {}, { defs = {} } = {}) {
  const plan = state.missionPlan || {}
  const entities = state.entities || {}
  const componentIds = Object.keys(entities).length ? Object.keys(entities) : (plan.components || [])
  const components = componentIds.map(id => ({
    id,
    label: defs[id]?.friendly || defs[id]?.label || id,
    part: defs[id]?.label || id,
  }))
  const phaseState = state.phaseState || {}
  const phases = PHASES.map(p => ({
    id: p.id,
    label: p.label,
    confirmed: !!phaseState[p.id]?.confirmed,
    confirmedAt: phaseState[p.id]?.confirmedAt || null,
  }))
  return {
    project: { name: plan.name || 'Missão', isDemo: !!state.demoMode },
    team: { name: plan.team?.name || '', institution: plan.team?.institution || '' },
    mission: {
      name: plan.name || 'Missão',
      framework: plan.frameworkId || null,
      cubeU: plan.cubeU || null,
      objectives: plan.objectiveCategories || plan.objectives || [],
      budgetBRL: plan.budgetBRL ?? null,
      environment: plan.environment || null,
      components,
    },
    schedule: state.schedule || null,
    phases,
    wireCount: (state.wires || []).length,
  }
}

// Normalize a server share payload into the same render-friendly shape.
export function fromSharePayload(summary = {}, { defs = {} } = {}) {
  const m = summary.mission || {}
  const componentIds = m.components || []
  const components = componentIds.map(id => ({
    id,
    label: defs[id]?.friendly || defs[id]?.label || id,
    part: defs[id]?.label || id,
  }))
  const ps = summary.phaseState || {}
  const phases = PHASES.map(p => ({
    id: p.id,
    label: p.label,
    confirmed: !!ps[p.id]?.confirmed,
    confirmedAt: ps[p.id]?.confirmedAt || null,
  }))
  return {
    project: summary.project || { name: m.name || 'Missão' },
    team: summary.team || { name: '', institution: '' },
    mission: { ...m, components },
    schedule: summary.schedule || null,
    phases,
    reports: (summary.reports || []).map(r => ({ ...r, phaseLabel: PHASE_LABEL[r.phaseId] || r.phaseId })),
    taskStats: summary.taskStats || null,
  }
}

export { PHASE_LABEL }
