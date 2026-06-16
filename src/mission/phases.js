// ──────────────────────────────────────────────────────────────────
// Phase model — the SINGLE source of truth for phase / sub-item state,
// shared by the expandable sidebar (Part 5), the phase-review screens
// (Part 6) and the top pipeline bar (Part 9). No duplicated progress
// logic anywhere else.
//
// Pure: takes a plain state snapshot, returns derived status. No store/UI
// imports (the store passes the slice it needs).
// ──────────────────────────────────────────────────────────────────

// The five build phases, each mapping to a section + its sub-items. `view`
// on a hardware sub-item lets the sidebar switch the 2D/3D canvas; the rest
// just navigate to the parent section.
export const PHASES = [
  {
    id: 'mission', section: 'mission', label: 'Mission',
    // Order matches the redesigned mission flow (Part 2): the team is
    // captured FIRST (identity before engineering), then form factor,
    // mission objectives and finally the restrictions. `step` lets the
    // sidebar/pipeline jump straight to that step of MissionWindow.
    sub: [
      { id: 'team', label: 'Equipe', step: 'team' },
      { id: 'format', label: 'Formato', step: 'format' },
      { id: 'challenges', label: 'Desafio', step: 'challenges' },
      { id: 'brainstorm', label: 'Ideias', step: 'brainstorm' },
      { id: 'document', label: 'Documento da missão', step: 'document' },
    ],
  },
  {
    id: 'hardware', section: 'hardware', label: 'Hardware',
    sub: [
      { id: 'schematic', label: 'Esquema 2D', view: '2d' },
      { id: 'pcb', label: 'Layout 3D', view: '3d' },
      { id: 'wiring', label: 'Fiação' },
    ],
  },
  {
    id: 'firmware', section: 'serialtest', label: 'Firmware',
    sub: [
      { id: 'editor', label: 'Editor de código' },
      { id: 'flash', label: 'Gravar' },
    ],
  },
  {
    id: 'testing', section: 'hwtest', label: 'Testes',
    sub: [
      { id: 'subsystems', label: 'Subsistemas' },
      { id: 'integration', label: 'Integração' },
    ],
  },
  {
    id: 'telemetry', section: 'telemetry', label: 'Telemetria',
    sub: [
      { id: 'ground', label: 'Estação base' },
      { id: 'logs', label: 'Dados' },
    ],
  },
]

export const PHASE_BY_SECTION = Object.fromEntries(PHASES.map(p => [p.section, p]))

// ── dependency graph (Prompt B Part 2) ──────────────────────────────
// Explicit upstream requirements per phase, from standard CubeSat
// practice. (Schematic/PCB Layout folds into Hardware; Integration
// Testing folds into Testing.) Downstream phases depend on these.
export const PHASE_DEPS = {
  mission: [], hardware: ['mission'], firmware: ['hardware'], testing: ['firmware'], telemetry: ['testing'],
}

// Explicit completion criteria per phase. A phase is "ready" only when
// EVERY criterion is met, and "done" only when the user CONFIRMS it via
// the phase-review screen (no auto-completion — Prompt B Part 2).
export function phaseCriteria(state) {
  const { missionPlan: mp = {}, entities = {}, live = {}, telemetry = [], hwtest = {}, fwFiles = [] } = state
  const ents = Object.keys(entities)
  const wiredAll = ents.length > 0 && ents.every(id => live?.wiring?.[id]?.wired)
  const stages = Object.values(hwtest?.stages || {})
  const allPassed = stages.length >= 5 && stages.every(s => s.status === 'passed')
  return {
    mission: [
      { id: 'team', label: 'Equipe definida', met: !!(mp.team?.name || '').trim() },
      { id: 'format', label: 'Formato escolhido', met: !!mp.cubeU },
      { id: 'objective', label: 'Pelo menos um objetivo', met: (mp.objectiveCategories?.length || 0) > 0 || !!mp.objectiveId },
      { id: 'budget', label: 'Orçamento definido', met: mp.budgetBRL != null },
    ],
    hardware: [
      { id: 'mcu', label: 'Computador de bordo (ESP32) na placa', met: ents.includes('esp32') },
      { id: 'parts', label: 'Ao menos 2 componentes', met: ents.length >= 2 },
    ],
    firmware: [
      { id: 'wired', label: 'Todos os componentes fiados', met: wiredAll },
      { id: 'generated', label: 'Firmware gerado', met: (fwFiles?.length || 0) > 0 },
    ],
    testing: [
      { id: 'passed', label: 'As 5 etapas de teste aprovadas', met: allPassed },
    ],
    telemetry: [
      { id: 'data', label: 'Telemetria recebida na estação', met: telemetry.length > 0 },
    ],
  }
}

// Input signature per phase — the upstream data it consumes. When this
// changes AFTER a confirmation the phase becomes "stale" (atualização
// necessária); dependents go stale too since their inputs embed the same
// data. This is the downstream-invalidation propagation.
export function phaseInputs(state) {
  const { missionPlan: mp = {}, entities = {}, wires = [], fwFiles = [], hwtest = {} } = state
  const ids = Object.keys(entities).sort().join(',')
  const w = wires.map(x => `${x.from.comp}.${x.from.pin}>${x.to.comp}.${x.to.pin}`).sort().join('|')
  const stg = Object.entries(hwtest?.stages || {}).map(([k, v]) => `${k}:${v.status}`).sort().join(',')
  return {
    mission: `${mp.name}|${mp.team?.name}|${mp.cubeU}|${(mp.objectiveCategories || []).join('+')}|${mp.budgetBRL}`,
    hardware: ids,
    firmware: `${ids}#${w}`,
    testing: `${ids}#${w}#${fwFiles.length}`,
    telemetry: stg,
  }
}
export const phaseReady = (id, state) => (phaseCriteria(state)[id] || []).every(c => c.met)

// Derive done/current/locked/stale + dependency info from a state
// snapshot. `gateAt` is the component count that unlocks downstream
// NAVIGATION (kept independent of confirmation so users can still explore).
export function derivePhases(state, { gateAt = 2 } = {}) {
  const { missionPlan: mp = {}, entities = {}, live = {}, telemetry = [], hwtest = {}, serialLog = [], hwLink = {}, fwFiles = [], wires = [], activeSection, phaseState = {} } = state
  const ents = Object.keys(entities)
  const nEnts = ents.length
  const wiredAll = nEnts > 0 && ents.every(id => live?.wiring?.[id]?.wired)
  const stages = Object.values(hwtest?.stages || {})
  const ranAny = stages.some(s => s.status && s.status !== 'idle')
  const allPassed = stages.length >= 5 && stages.every(s => s.status === 'passed')

  const hwReady = nEnts >= gateAt

  const subDone = {
    mission: {
      team: !!(mp.team?.name || '').trim() && mp.budgetBRL != null,
      format: !!mp.cubeU,
      // objective is implicit in the selected challenges (Part 3)
      challenges: (mp.challenges?.length || 0) > 0 || (mp.objectiveCategories?.length || 0) > 0,
      brainstorm: (mp.brainstorm?.cards || []).some(c => !c.draft),
      document: (mp.brainstorm?.cards || []).some(c => c.decided),
    },
    hardware: { schematic: (wires?.length || 0) > 0, pcb: nEnts >= 1, wiring: wiredAll },
    firmware: { editor: (fwFiles?.length || 0) > 0, flash: !!hwLink?.connected },
    testing: { subsystems: ranAny, integration: allPassed },
    telemetry: { ground: telemetry.length > 0, logs: serialLog.length > 2 },
  }

  // explicit completion + staleness (Prompt B Part 2)
  const crit = phaseCriteria(state)
  const inputs = phaseInputs(state)
  const ready = {}, confirmed = {}, stale = {}, done = {}
  for (const id of PHASE_IDS) {
    ready[id] = (crit[id] || []).every(c => c.met)
    const ps = phaseState[id]
    confirmed[id] = !!ps?.confirmed
    stale[id] = !!ps?.confirmed && ps.sig !== inputs[id]
    done[id] = confirmed[id] && !stale[id]
  }

  const status = {}
  for (const p of PHASES) {
    const reqs = PHASE_DEPS[p.id] || []
    // navigation lock is unchanged (don't trap users); completion is what
    // now requires confirmation.
    const navLocked = p.id !== 'mission' && p.id !== 'hardware' && !hwReady
    const needsUpdate = stale[p.id] || (confirmed[p.id] && reqs.some(r => !done[r]))
    status[p.id] = {
      done: done[p.id],
      ready: ready[p.id],
      confirmed: confirmed[p.id],
      stale: stale[p.id],
      needsUpdate,
      current: activeSection === p.section,
      locked: navLocked,
      requires: reqs,
      dependents: PHASE_IDS.filter(o => (PHASE_DEPS[o] || []).includes(p.id)),
      criteria: crit[p.id] || [],
      sub: subDone[p.id] || {},
    }
  }
  return { status, hwReady, ready, done }
}

// Linear order helpers for the pipeline bar / review "next phase".
export const PHASE_IDS = PHASES.map(p => p.id)
export const nextPhase = (id) => {
  const i = PHASE_IDS.indexOf(id)
  return i >= 0 && i < PHASE_IDS.length - 1 ? PHASES[i + 1] : null
}
