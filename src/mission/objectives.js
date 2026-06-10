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
