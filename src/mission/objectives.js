// ──────────────────────────────────────────────────────────────────
// Scientific objectives — the mission's single primary objective.
//
// Each objective carries *editable metadata* (`meta`) that explains what
// defines that mission category, and declarative `requirements` (same
// rule shapes as frameworks.js, consumed by the validation engine).
// Objective rules are tagged source:'objective' so the UI can show
// WHERE a validation message comes from.
//
// `custom` is a special objective whose meta the user writes freely.
// Pure data — no store/UI imports.
// ──────────────────────────────────────────────────────────────────

export const OBJECTIVES = [
  {
    id: 'environmental',
    label: 'Monitoramento ambiental',
    desc: 'Temperatura, pressão e perfil atmosférico em altitude.',
    meta: {
      sensors: 'Sensores ambientais (temperatura, pressão)',
      telemetry: 'Pacote ambiental: T, P, altitude barométrica',
      rateHz: '1 Hz',
      altitude: 'até ~30 km (estratosfera)',
      notes: 'Correlacionar leituras com altitude; atenção ao frio extremo.',
    },
    requirements: [
      {
        id: 'obj-env-sensor', kind: 'capability', capability: ['temperature', 'pressure'], mode: 'all',
        severity: 'error', source: 'objective',
        title: 'Sensor ambiental necessário',
        detail: 'O objetivo ambiental exige medir temperatura e pressão. Nenhum sensor selecionado cobre isso.',
        suggest: ['bmp280'],
      },
    ],
  },
  {
    id: 'attitude',
    label: 'Dinâmica de voo',
    desc: 'Aceleração, rotação e estimativa de atitude durante o voo.',
    meta: {
      sensors: 'IMU (acelerômetro + giroscópio)',
      telemetry: 'Vetores de aceleração e rotação, atitude estimada',
      rateHz: '10 Hz',
      altitude: 'qualquer — foco no comportamento dinâmico',
      notes: 'Calibrar offsets do IMU em solo; isolar de vibração mecânica.',
    },
    requirements: [
      {
        id: 'obj-att-imu', kind: 'capability', capability: 'imu', mode: 'any',
        severity: 'error', source: 'objective',
        title: 'IMU necessário',
        detail: 'O objetivo de dinâmica de voo exige um sensor inercial (acelerômetro + giroscópio).',
        suggest: ['mpu6050'],
      },
    ],
  },
  {
    id: 'altitude_profile',
    label: 'Perfil de altitude',
    desc: 'Altitude barométrica contínua e eventos de voo (subida, burst, queda).',
    meta: {
      sensors: 'Barômetro de precisão + IMU para detecção de eventos',
      telemetry: 'Altitude barométrica, taxa de subida, eventos',
      rateHz: '2 Hz',
      altitude: 'até ~30 km',
      notes: 'Detectar burst do balão pela inversão da taxa de subida.',
    },
    requirements: [
      {
        id: 'obj-alt-baro', kind: 'capability', capability: 'pressure', mode: 'any',
        severity: 'error', source: 'objective',
        title: 'Barômetro necessário',
        detail: 'Altitude barométrica exige um sensor de pressão.',
        suggest: ['bmp280'],
      },
      {
        id: 'obj-alt-imu', kind: 'capability', capability: 'imu', mode: 'any',
        severity: 'warn', source: 'objective',
        title: 'IMU recomendado',
        detail: 'Eventos de voo (burst, queda livre) ficam muito mais confiáveis com aceleração.',
        suggest: ['mpu6050'],
      },
    ],
  },
  {
    id: 'custom',
    label: 'Objetivo personalizado',
    desc: 'Descreva o objetivo científico e defina as expectativas você mesmo.',
    meta: {
      sensors: '',
      telemetry: '',
      rateHz: '',
      altitude: '',
      notes: '',
    },
    requirements: [
      {
        id: 'obj-custom-sensor', kind: 'system', category: 'sensor',
        severity: 'warn', source: 'objective',
        title: 'Nenhum sensor científico',
        detail: 'Um objetivo científico precisa de ao menos um sensor coletando dados.',
        suggest: ['bmp280', 'mpu6050'],
      },
    ],
  },
]

export const OBJECTIVES_BY_ID = Object.fromEntries(OBJECTIVES.map((o) => [o.id, o]))
export const getObjective = (id) => OBJECTIVES_BY_ID[id] || null

// ──────────────────────────────────────────────────────────────────
// Visual objective CATEGORIES (Part 2 of the redesign).
//
// Instead of a free-text "what does the mission measure?" box, the user
// picks one or more mission categories as illustrated cards. Each card
// maps (`objective`) to one of the OBJECTIVES above so the existing
// declarative validation + firmware generation keep working unchanged —
// the PRIMARY (first-selected) category's mapped objective becomes the
// plan's `objectiveId`. `icon` is an SVG path string drawn by the cards;
// `payload` keys the extra payload module the SatelliteAssembly draws,
// so multiple objectives build a visibly more complex payload bay.
// ──────────────────────────────────────────────────────────────────
export const OBJECTIVE_CATEGORIES = [
  {
    id: 'atmospheric', label: 'Sensoriamento atmosférico', objective: 'environmental', payload: 'baro',
    desc: 'Temperatura, pressão e perfil da atmosfera em altitude.',
    icon: 'M4 14h16M6 18h12M8 10c0-3 8-3 8 0M3 6h7',
  },
  {
    id: 'earth_obs', label: 'Observação da Terra', objective: 'custom', payload: 'cam',
    desc: 'Imagear ou medir a superfície e a atmosfera abaixo.',
    icon: 'M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  },
  {
    id: 'communication', label: 'Experimentos de comunicação', objective: 'custom', payload: 'antenna',
    desc: 'Testar enlaces de rádio, protocolos e alcance.',
    icon: 'M12 20v-8M12 12a5 5 0 015 5M12 12a5 5 0 00-5 5M12 7a9 9 0 019 9M12 7a9 9 0 00-9 9',
  },
  {
    id: 'radiation', label: 'Medição de radiação', objective: 'custom', payload: 'geiger',
    desc: 'Dose e fluxo de partículas ao longo do voo.',
    icon: 'M12 12l5-7M12 12l5 7M12 12L5 12M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z',
  },
  {
    id: 'attitude_control', label: 'Controle de atitude', objective: 'attitude', payload: 'imu',
    desc: 'Demonstrar estabilização e orientação do satélite.',
    icon: 'M12 3v18M3 12h18M5 5l14 14M19 5L5 19',
  },
  {
    id: 'biological', label: 'Carga biológica', objective: 'custom', payload: 'bio',
    desc: 'Expor amostras vivas ao ambiente de voo.',
    icon: 'M9 3c0 6 6 6 6 12a3 3 0 11-6 0c0-6 6-6 6-12M9 8h6M9 12h6',
  },
  {
    id: 'tech_demo', label: 'Demonstração tecnológica', objective: 'custom', payload: 'tech',
    desc: 'Validar um subsistema ou tecnologia nova em voo.',
    icon: 'M9 3h6v4l4 9a2 2 0 01-2 3H7a2 2 0 01-2-3l4-9V3zM7 14h10',
  },
]
export const OBJECTIVE_CATEGORIES_BY_ID = Object.fromEntries(OBJECTIVE_CATEGORIES.map(c => [c.id, c]))

// Mission priorities the team ranks visually (Part 2) — replaces the old
// free-text "priorities" box. The ORDER expresses what matters most; the
// consultant/validation can read it to bias tradeoffs.
export const MISSION_PRIORITIES = [
  { id: 'cost',        label: 'Minimizar custo' },
  { id: 'mass',        label: 'Minimizar massa' },
  { id: 'reliability', label: 'Maximizar confiabilidade' },
  { id: 'deadline',    label: 'Cumprir o prazo' },
  { id: 'science',     label: 'Maximizar retorno científico' },
  { id: 'integration', label: 'Facilidade de integração' },
  { id: 'education',    label: 'Valor educacional' },
]
export const MISSION_PRIORITIES_BY_ID = Object.fromEntries(MISSION_PRIORITIES.map(p => [p.id, p]))

// The primary objectiveId for a set of selected category ids (first wins),
// so validation/firmware keep their single-objective contract.
export function primaryObjectiveId(categoryIds = []) {
  for (const cid of categoryIds) {
    const c = OBJECTIVE_CATEGORIES_BY_ID[cid]
    if (c) return c.objective
  }
  return null
}

// Metadata field labels (for the editable metadata UI)
export const OBJECTIVE_META_FIELDS = [
  { key: 'sensors',   label: 'Sensores esperados' },
  { key: 'telemetry', label: 'Telemetria' },
  { key: 'rateHz',    label: 'Taxa de amostragem' },
  { key: 'altitude',  label: 'Altitude assumida' },
  { key: 'notes',     label: 'Notas' },
]

// Resolve the effective objective for a plan: preset meta merged with the
// user's edits (plan.objectiveMeta) so edited metadata drives everything.
export function resolveObjective(plan) {
  const base = getObjective(plan?.objectiveId)
  if (!base) return null
  return { ...base, meta: { ...base.meta, ...(plan.objectiveMeta || {}) } }
}
