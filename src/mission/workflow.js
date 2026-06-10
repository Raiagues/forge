// ──────────────────────────────────────────────────────────────────
// Mission planning workflow — the 10 engineering stages.
//
// Each step declares an `isComplete(ctx)` predicate over a context bag
// { plan, defs, entitiesCount, telemetryCount, validation } so the UI
// can render progress without embedding any logic itself.
// ──────────────────────────────────────────────────────────────────

import { defsForIds, byCategory, hasCapability } from './capabilities.js'

export const WORKFLOW_STEPS = [
  {
    id: 'framework', n: 1, label: 'Framework', hint: 'Competição ou referência',
    isComplete: ({ plan }) => !!plan.frameworkId,
  },
  {
    id: 'objectives', n: 2, label: 'Objetivos', hint: 'Metas da missão',
    isComplete: ({ plan }) => plan.objectives.length > 0,
  },
  {
    id: 'environment', n: 3, label: 'Ambiente', hint: 'Plataforma e restrições',
    isComplete: ({ plan }) => !!plan.environment.altitude || !!plan.environment.platform,
  },
  {
    id: 'payload', n: 4, label: 'Sensores', hint: 'Payload científico',
    isComplete: ({ plan, defs }) => byCategory(defsForIds(defs, plan.components), 'sensor').length > 0,
  },
  {
    id: 'comms', n: 5, label: 'Comunicação', hint: 'Enlace de telemetria',
    isComplete: ({ plan, defs }) => {
      const d = defsForIds(defs, plan.components)
      return hasCapability(d, 'wifi') || hasCapability(d, 'lora') || hasCapability(d, 'rf')
    },
  },
  {
    id: 'software', n: 6, label: 'Software', hint: 'Módulos de firmware',
    isComplete: ({ plan }) => plan.software.length > 0,
  },
  {
    id: 'validate', n: 7, label: 'Validação', hint: 'Requisitos e regras',
    isComplete: ({ validation }) => !!validation && validation.ok,
  },
  {
    id: 'architecture', n: 8, label: 'Arquitetura', hint: 'Gerar hardware/software',
    isComplete: ({ entitiesCount }) => entitiesCount > 0,
  },
  {
    id: 'test', n: 9, label: 'Testes', hint: 'Verificar módulos',
    isComplete: ({ entitiesCount }) => entitiesCount > 0,
  },
  {
    id: 'operate', n: 10, label: 'Operação', hint: 'Simular missão',
    isComplete: ({ telemetryCount }) => telemetryCount > 0,
  },
]

export const STEP_IDS = WORKFLOW_STEPS.map((s) => s.id)
export const getStep = (id) => WORKFLOW_STEPS.find((s) => s.id === id) || WORKFLOW_STEPS[0]
export const nextStepId = (id) => {
  const i = STEP_IDS.indexOf(id)
  return i >= 0 && i < STEP_IDS.length - 1 ? STEP_IDS[i + 1] : id
}
export const prevStepId = (id) => {
  const i = STEP_IDS.indexOf(id)
  return i > 0 ? STEP_IDS[i - 1] : id
}
