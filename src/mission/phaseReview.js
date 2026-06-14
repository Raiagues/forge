// ──────────────────────────────────────────────────────────────────
// Phase review — builds the "mission readiness review" shown when the
// user finishes a phase and is about to advance (Part 6 of the redesign).
//
// Not a confirm dialog: it summarizes what was decided/built, surfaces
// unresolved warnings/violations, and reports the budget status — so the
// advance feels like a readiness gate, not an "are you sure?". Pure: the
// store passes the slice it needs.
// ──────────────────────────────────────────────────────────────────

import { resolveObjective } from './objectives.js'
import { getFramework, getObsatFormat } from './frameworks.js'
import { nextPhase, PHASES } from './phases.js'
import { budgetsOver } from './budgets.js'

const phaseLabel = (id) => PHASES.find(p => p.id === id)?.label || id

export function buildPhaseReview(phaseId, { defs, missionPlan = {}, entities = {}, live = {}, hwtest = {} }) {
  const ids = Object.keys(entities)
  const fw = getFramework(missionPlan.frameworkId)
  const obj = resolveObjective(missionPlan)
  const fmt = getObsatFormat(missionPlan.format || fw?.defaultFormat || 'cubesat')

  // what was decided / built in this phase
  const decisions = []
  if (phaseId === 'mission') {
    if (fw) decisions.push(['Competição', fw.name])
    decisions.push(['Formato', fmt.label])
    if (obj) decisions.push(['Objetivo', obj.label])
    if (missionPlan.name?.trim()) decisions.push(['Missão', missionPlan.name.trim()])
  } else if (phaseId === 'hardware') {
    decisions.push(['Componentes', ids.map(id => defs[id]?.friendly || id).join(', ') || 'nenhum'])
    const wired = ids.filter(id => live?.wiring?.[id]?.wired).length
    decisions.push(['Fiação', `${wired}/${ids.length} conectados`])
  } else if (phaseId === 'firmware') {
    decisions.push(['Arquivos gerados', String((live?.fwFiles?.length) || ids.length ? 'firmware pronto' : '—')])
  } else if (phaseId === 'testing') {
    const stages = Object.values(hwtest?.stages || {})
    decisions.push(['Testes', `${stages.filter(s => s.status === 'passed').length}/${stages.length || 0} aprovados`])
  }

  // unresolved issues (validation errors/warnings + budget overflow)
  const v = live?.validation
  const issues = (v?.issues || []).filter(i => i.severity === 'error' || i.severity === 'warn').slice(0, 5)
  const overBudget = budgetsOver(live?.budgets)

  const next = nextPhase(phaseId)
  const errors = (v?.summary?.errors || 0)
  const nominal = errors === 0 && !overBudget

  return {
    phaseId,
    phaseLabel: phaseLabel(phaseId),
    nextPhase: next,
    decisions,
    issues,
    overBudget,
    budgets: live?.budgets || null,
    nominal,
    headline: nominal
      ? `Fase ${phaseLabel(phaseId)} concluída · sistemas nominais`
      : `Fase ${phaseLabel(phaseId)} · ${errors ? `${errors} pendência${errors > 1 ? 's' : ''}` : 'orçamento estourado'}`,
  }
}
