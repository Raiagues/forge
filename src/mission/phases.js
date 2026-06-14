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
    sub: [
      { id: 'context', label: 'Contexto' },
      { id: 'format', label: 'Formato' },
      { id: 'objective', label: 'Objetivo' },
      { id: 'team', label: 'Equipe' },
      { id: 'constraints', label: 'Restrições' },
      { id: 'components', label: 'Componentes' },
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

// Derive done/current/locked + per-sub completion from a state snapshot.
// `gateAt` is the component count below which downstream phases are locked.
export function derivePhases(state, { gateAt = 2 } = {}) {
  const { missionPlan: mp = {}, entities = {}, live = {}, telemetry = [], hwtest = {}, serialLog = [], hwLink = {}, fwFiles = [], wires = [], activeSection } = state
  const ents = Object.keys(entities)
  const nEnts = ents.length
  const wiredAll = nEnts > 0 && ents.every(id => live?.wiring?.[id]?.wired)
  const stages = Object.values(hwtest?.stages || {})
  const ranAny = stages.some(s => s.status && s.status !== 'idle')
  const allPassed = stages.length >= 5 && stages.every(s => s.status === 'passed')

  // hardware on the board unlocks the downstream phases
  const hwReady = nEnts >= gateAt

  // sub-item completion predicates
  const subDone = {
    mission: {
      context: !!mp.kind,
      format: !!mp.format,
      objective: !!mp.objectiveId || !!(mp.custom?.description || '').trim(),
      team: !!(mp.team?.name || '').trim(),
      constraints: mp.budgetBRL != null || !!(mp.priorities || '').trim(),
      components: nEnts >= 1,
    },
    hardware: {
      schematic: (wires?.length || 0) > 0,
      pcb: nEnts >= 1,
      wiring: wiredAll,
    },
    firmware: {
      editor: (fwFiles?.length || 0) > 0,
      flash: !!hwLink?.connected,
    },
    testing: {
      subsystems: ranAny,
      integration: allPassed,
    },
    telemetry: {
      ground: telemetry.length > 0,
      logs: serialLog.length > 2,
    },
  }

  // phase-level completion (a phase is done when its key milestone is met)
  const phaseDone = {
    mission: !!mp.frameworkId && (!!mp.objectiveId || !!(mp.custom?.description || '').trim()) && (mp.name?.trim().length >= 2) && !!mp.format,
    hardware: nEnts >= gateAt,
    firmware: wiredAll && nEnts >= 1,
    testing: allPassed,
    telemetry: telemetry.length > 0,
  }

  const status = {}
  for (const p of PHASES) {
    const locked = p.id !== 'mission' && p.id !== 'hardware' && !hwReady
    status[p.id] = {
      done: !!phaseDone[p.id],
      current: activeSection === p.section,
      locked,
      sub: subDone[p.id] || {},
    }
  }
  return { status, hwReady }
}

// Linear order helpers for the pipeline bar / review "next phase".
export const PHASE_IDS = PHASES.map(p => p.id)
export const nextPhase = (id) => {
  const i = PHASE_IDS.indexOf(id)
  return i >= 0 && i < PHASE_IDS.length - 1 ? PHASES[i + 1] : null
}
