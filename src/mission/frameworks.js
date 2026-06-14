// ──────────────────────────────────────────────────────────────────
// Mission frameworks — competitions and references as first-class,
// structured data. Requirements are declarative rules consumed by the
// validation engine (see validation.js), NOT prose.
//
// Rule kinds understood by the validator:
//   capability { capability: string|string[], mode:'any'|'all', suggest:[…] }
//   system     { category: 'mcu'|'power'|'sensor'|'comm'|'storage', suggest:[…] }
//   mass       { maxG }
//   count      { category, min, max }
// Each rule also carries: id, severity ('error'|'warn'|'info'), title, detail.
// `suggest` entries are component ids OR capability names (auto-expanded).
// ──────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────
// OBSAT competition profile — research-backed (Part 1 of the redesign).
//
// SOURCE: official wiki da Olimpíada Brasileira de Satélites (MCTI),
// modalidade prática, 3ª edição — https://wiki.obsat.org.br/books/
// modalidade-pratica (Fase 2: "Construa, programe, teste seu satélite!").
// Extracted 2026-06 (see OBSAT.asOf). The 3ª edição may have concluded;
// the numbers below are the most recent official spec. ⚠️ When a new
// edital is published, re-verify the masses, sizes, telemetry cadence and
// the cronograma dates flagged TODO below.
// ──────────────────────────────────────────────────────────────────

// Accepted satellite form factors (Fase 2). massMaxG already INCLUDES the
// +5 g upward tolerance from the edital (tolG kept for display). Sizes are
// verbatim from the wiki. Consumed by the budget meters (Part 3) and the
// format step of the consultant flow (Part 2). ✅ confirmed from wiki.
export const OBSAT_FORMATS = {
  cubesat:    { id: 'cubesat',    label: 'CubeSat 1U',  massMaxG: 455, tolG: 5, sizeMm: [100, 100, 100], cylinder: false, sizeNote: '100 ± 2 mm (cubo de 1U)' },
  cansat:     { id: 'cansat',     label: 'CanSat',      massMaxG: 355, tolG: 5, sizeMm: [66, 100, 66],   cylinder: true,  sizeNote: '100 ± 2 mm × Ø 66 ± 1,32 mm' },
  pocketqube: { id: 'pocketqube', label: 'PocketQube',  massMaxG: 185, tolG: 5, sizeMm: [50, 50, 50],    cylinder: false, sizeNote: '50 ± 1 mm (cubo)' },
}
export const OBSAT_FORMAT_LIST = Object.values(OBSAT_FORMATS)
export const getObsatFormat = (id) => OBSAT_FORMATS[id] || OBSAT_FORMATS.cubesat

export const OBSAT = {
  id: 'obsat',
  kind: 'competition',
  name: 'OBSAT',
  full: 'Olimpíada Brasileira de Satélites · MCTI · Fase 2',
  edition: '3ª OBSAT',
  // ⚠️ Provenance flag (per redesign brief): keep this honest about when the
  // spec was read and from where, so stale data is visible in the UI.
  asOf: 'spec extraída em 2026-06 do wiki.obsat.org.br (modalidade prática · 3ª edição)',
  sourceUrl: 'https://wiki.obsat.org.br/books/modalidade-pratica',
  tagline: 'Construa o computador de bordo e a missão de um nanossatélite e transmita telemetria padronizada por WiFi.',
  description:
    'Na Fase 2 da OBSAT cada equipe constrói, programa e testa um satélite educacional (CubeSat, CanSat ou ' +
    'PocketQube). O sistema deve adquirir os dados obrigatórios, armazená-los em memória e transmitir um ' +
    'pacote de telemetria em JSON por WiFi (HTTP) a cada 4 minutos durante pelo menos 2 horas de operação.',

  // Form factors + the default the consultant flow starts from.
  formats: OBSAT_FORMATS,
  defaultFormat: 'cubesat',

  environment: {
    platform: 'Plataforma OBSAT (balão de alta altitude)',
    altitude: 'até 30 km',                         // ✅ wiki: "até 30km de altitude"
    tempRange: '-60 °C … +30 °C',                  // ⚠️ típico de estratosfera; não citado número exato no wiki
    notes: 'Baixa pressão, gradiente térmico severo e vibração no lançamento. ' +
      'A bateria exige isolamento térmico (Depron ou espuma EPE).',
  },

  // Default = CubeSat (455 g). The mass requirement below uses this; o medidor
  // de massa (Part 3) passa a usar o limite do formato escolhido.
  payload: { massMaxG: 455, note: 'Massa máxima depende do formato: CubeSat 455 g · CanSat 355 g · PocketQube 185 g (já com +5 g de tolerância).' },

  // ✅ wiki: estrutura termoplástica + isolamento térmico da bateria.
  structure: {
    materials: ['PLA', 'PETG'],
    note: 'Estrutura mecânica em material termoplástico (PLA ou PETG). Isolar termicamente a bateria com Depron / espuma EPE.',
  },

  // Mandatory telemetry packet (Fase 2). ✅ campos e cadência do wiki; o
  // formato JSON exato vive no "apêndice 1" do edital (servidor de testes).
  telemetry: {
    transport: 'WiFi · HTTP · JSON',
    intervalSec: 240,            // ✅ "intervalos de 4 minutos"
    durationMin: 120,            // ✅ "pelo menos 2 horas"
    payloadMaxBytes: 90,         // ✅ "90 bytes por pacote de payload"
    fields: [
      { key: 'bateria',      label: 'Nível de bateria',                cap: 'power' },
      { key: 'temperatura',  label: 'Temperatura',                     cap: 'temperature' },
      { key: 'pressao',      label: 'Pressão',                         cap: 'pressure' },
      { key: 'giroscopio',   label: 'Giroscópio (3 eixos)',            cap: 'gyro' },
      { key: 'acelerometro', label: 'Acelerômetro (3 eixos)',          cap: 'accel' },
      { key: 'payload',      label: 'Dados da missão (payload ≤90 B)', cap: null },
    ],
    note: 'Pacote JSON enviado por HTTP a cada 4 min, por ≥ 2 h. Campos obrigatórios: bateria, ' +
      'temperatura, pressão, giroscópio e acelerômetro (3 eixos) e os dados da missão. Formato exato no apêndice 1 do edital.',
  },

  // ✅ wiki: dados coletados devem ser armazenados em memória a bordo.
  storage: { required: true, note: 'Os dados coletados devem ser armazenados em memória a bordo (backup do enlace).' },

  // starter parts dropped in when the framework is selected
  starter: ['esp32', 'lipo_2000'],
  suggestedObjectives: [
    'Transmitir o pacote de telemetria por WiFi (HTTP/JSON) a cada 4 minutos',
    'Medir temperatura e pressão durante todo o voo',
    'Registrar giroscópio e acelerômetro nos três eixos',
    'Armazenar os dados coletados em memória a bordo',
  ],

  // 3ª edição — fases oficiais (modalidade prática). ⚠️ TODO: as datas
  // exatas do cronograma não estão consolidadas no wiki público; o anúncio
  // da 3ª OBSAT foi em 24/02 e as inscrições se estenderam por abril/2025.
  // Mapear para datas reais no SchedulePanel (Part 7) quando o edital sair.
  timeline: [
    { id: 'fase0', phase: 'Fase 0 · Capacitação',          when: 'cursos e nivelamento', cls: 'ok' },
    { id: 'fase1', phase: 'Fase 1 · Planejamento de missão', when: 'projeto da missão',    cls: 'info' },
    { id: 'fase2', phase: 'Fase 2 · Construção e programação', when: 'monte e teste',       cls: 'warn' },
    { id: 'fase3', phase: 'Fase 3 · Lançamentos regionais',  when: 'etapas regionais',     cls: 'info' },
    { id: 'fase4', phase: 'Fase 4 · Evento nacional',        when: 'final',                cls: 'info' },
  ],

  // ⚠️ Pesos ILUSTRATIVOS — os pesos oficiais de avaliação não foram
  // confirmados no wiki público. Revisar com o edital antes de exibir como oficial.
  scoring: [
    { criterion: 'Telemetria WiFi funcional (pacote completo)', weight: 30 },
    { criterion: 'Qualidade dos dados científicos', weight: 25 },
    { criterion: 'Robustez, autonomia e estrutura', weight: 20 },
    { criterion: 'Documentação e reprodutibilidade', weight: 15 },
    { criterion: 'Originalidade da missão', weight: 10 },
  ],

  requirements: [
    {
      id: 'obsat-mcu', kind: 'count', category: 'mcu', min: 1, max: 1, severity: 'error', source: 'competition',
      title: 'Exatamente um computador de bordo',
      detail: 'A missão precisa de um microcontrolador como computador de bordo (e apenas um barramento principal).',
      suggest: ['esp32'],
    },
    {
      id: 'obsat-wifi', kind: 'capability', capability: 'wifi', mode: 'any', severity: 'error', source: 'comm',
      title: 'Telemetria WiFi obrigatória',
      detail: 'O OBSAT exige transmitir o pacote de telemetria por WiFi (HTTP/JSON) à estação base. ' +
        'O computador de bordo precisa ter rádio WiFi.',
      suggest: ['esp32'],
    },
    {
      // Power modelling is intentionally light for now — the battery
      // module is "coming soon", so this stays informational.
      id: 'obsat-power', kind: 'system', category: 'power', severity: 'info', source: 'competition',
      title: 'Fonte de energia com isolamento térmico',
      detail: 'O voo exige bateria com autonomia para ≥ 2 h, isolada termicamente (Depron/EPE). O módulo de energia chega em breve ao GuiaSat.',
      suggest: [],
    },
    {
      id: 'obsat-telemetry', kind: 'capability', capability: ['temperature', 'pressure'], mode: 'all', severity: 'warn', source: 'competition',
      title: 'Telemetria de temperatura e pressão (obrigatória)',
      detail: 'O pacote obrigatório inclui temperatura e pressão. Sem esses sensores o pacote fica incompleto.',
      suggest: ['bmp280'],
    },
    {
      id: 'obsat-imu', kind: 'capability', capability: 'imu', mode: 'any', severity: 'warn', source: 'competition',
      title: 'Telemetria inercial (giroscópio + acelerômetro)',
      detail: 'O pacote obrigatório inclui giroscópio e acelerômetro nos três eixos. Adicione um IMU.',
      suggest: ['mpu6050'],
    },
    {
      // Default CubeSat limit (455 g). ⚠️ Part 3 substitui maxG pelo limite do
      // formato escolhido (CubeSat 455 · CanSat 355 · PocketQube 185).
      id: 'obsat-mass', kind: 'mass', maxG: 455, severity: 'error', source: 'budget',
      title: 'Massa dentro do limite do formato',
      detail: 'A soma das massas dos componentes não pode ultrapassar o limite do formato (CubeSat 455 g · CanSat 355 g · PocketQube 185 g, já com tolerância).',
    },
  ],
}

// Coming-soon competitions — rendered disabled in the picker. New
// competitions are added here as pure data (same shape as OBSAT).
export const COMING_SOON_FRAMEWORKS = [
  { id: 'lasc',   kind: 'competition', name: 'LASC',   full: 'Latin American Space Challenge', tagline: 'CanSats e foguetes — em breve no GuiaSat.', comingSoon: true },
  { id: 'cansat', kind: 'competition', name: 'CanSat', full: 'CanSat Brasil',                  tagline: 'Satélite-lata em queda livre — em breve no GuiaSat.', comingSoon: true },
]

export const CUSTOM = {
  id: 'custom',
  kind: 'custom',
  name: 'Missão personalizada',
  full: 'Missão personalizada',
  tagline: 'Descreva a missão em linguagem natural e deixe o copiloto propor a arquitetura.',
  description:
    'Defina plataforma, ambiente, objetivos científicos e metas de telemetria. O copiloto analisa a ' +
    'descrição e recomenda sensores, comunicação, energia e família de microcontrolador.',
  environment: { platform: '', altitude: '', tempRange: '', notes: '' },
  payload: { massMaxG: null, note: 'Sem limite imposto — defina suas próprias restrições.' },
  starter: [],
  suggestedObjectives: [],
  timeline: [],
  scoring: [],
  // Baseline sanity rules every flying system should satisfy.
  requirements: [
    {
      id: 'custom-mcu', kind: 'system', category: 'mcu', severity: 'error',
      title: 'Computador de bordo necessário',
      detail: 'Toda missão precisa de um microcontrolador para adquirir e processar dados.',
      suggest: ['esp32', 'rp2040'],
    },
    {
      id: 'custom-power', kind: 'system', category: 'power', severity: 'error',
      title: 'Fonte de energia necessária',
      detail: 'Defina como o sistema será alimentado durante a operação.',
      suggest: ['lipo_2000'],
    },
    {
      id: 'custom-comm', kind: 'capability', capability: ['wifi', 'lora', 'rf'], mode: 'any', severity: 'warn',
      title: 'Telemetria sem enlace',
      detail: 'Nenhum sistema de comunicação detectado — os dados não poderão ser transmitidos em tempo real.',
      suggest: ['lora_sx1276', 'esp32'],
    },
    {
      id: 'custom-sensor', kind: 'system', category: 'sensor', severity: 'warn',
      title: 'Nenhum sensor científico',
      detail: 'Uma missão científica precisa de ao menos um sensor para coletar dados.',
      suggest: ['bmp280', 'mpu6050'],
    },
  ],
}

export const FRAMEWORKS = { [OBSAT.id]: OBSAT, [CUSTOM.id]: CUSTOM }
export const FRAMEWORK_LIST = [OBSAT, CUSTOM]
export const getFramework = (id) => FRAMEWORKS[id] || null
