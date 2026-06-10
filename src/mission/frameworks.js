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

export const OBSAT = {
  id: 'obsat',
  kind: 'competition',
  name: 'OBSAT',
  full: 'Olimpíada Brasileira de Satélites · Fase 2',
  tagline: 'Construa a missão (payload) de um nanossatélite e transmita telemetria à estação base.',
  description:
    'Na Fase 2 da OBSAT cada equipe desenvolve o computador de bordo e a missão científica de um ' +
    'satélite educacional. O sistema deve adquirir dados, montar um pacote de telemetria padronizado ' +
    'e transmiti-lo por WiFi para a estação base durante a janela de operação.',
  environment: {
    platform: 'Plataforma OBSAT (balão / suborbital)',
    altitude: '~ 30 km',
    tempRange: '-60 °C … +30 °C',
    notes: 'Baixa pressão, gradiente térmico severo e vibração no lançamento.',
  },
  payload: { massMaxG: 250, note: 'Massa total do payload limitada; volume restrito ao gabarito do edital.' },
  // starter parts dropped in when the framework is selected
  starter: ['esp32', 'lipo_2000'],
  suggestedObjectives: [
    'Transmitir pacote de telemetria por WiFi a 1 Hz',
    'Medir temperatura e pressão durante todo o voo',
    'Registrar dados brutos como backup',
    'Estimar atitude / movimento do satélite',
  ],
  timeline: [
    { phase: 'Inscrição', when: 'concluída', cls: 'ok' },
    { phase: 'Entrega do projeto', when: 'T-26 dias', cls: 'warn' },
    { phase: 'Integração e testes', when: 'T-12 dias', cls: 'info' },
    { phase: 'Lançamento / operação', when: 'T-0', cls: 'info' },
  ],
  scoring: [
    { criterion: 'Telemetria WiFi funcional', weight: 30 },
    { criterion: 'Qualidade dos dados científicos', weight: 25 },
    { criterion: 'Robustez e autonomia', weight: 20 },
    { criterion: 'Documentação e reprodutibilidade', weight: 15 },
    { criterion: 'Originalidade da missão', weight: 10 },
  ],
  requirements: [
    {
      id: 'obsat-mcu', kind: 'count', category: 'mcu', min: 1, max: 1, severity: 'error',
      title: 'Exatamente um computador de bordo',
      detail: 'A missão precisa de um microcontrolador como computador de bordo (e apenas um barramento principal).',
      suggest: ['esp32'],
    },
    {
      id: 'obsat-wifi', kind: 'capability', capability: 'wifi', mode: 'any', severity: 'error',
      title: 'Comunicação WiFi obrigatória',
      detail: 'O OBSAT exige transmissão do pacote de telemetria por WiFi para a estação base. ' +
        'O computador de bordo precisa ter rádio WiFi.',
      suggest: ['esp32', 'esp8266'],
    },
    {
      id: 'obsat-power', kind: 'system', category: 'power', severity: 'error',
      title: 'Fonte de energia obrigatória',
      detail: 'É necessária uma bateria/fonte que garanta autonomia durante a janela de operação.',
      suggest: ['lipo_2000'],
    },
    {
      id: 'obsat-telemetry', kind: 'capability', capability: ['temperature', 'pressure'], mode: 'all', severity: 'warn',
      title: 'Telemetria de temperatura e pressão',
      detail: 'O pacote padrão inclui temperatura e pressão. Sem esses sensores o pacote fica incompleto.',
      suggest: ['bme280'],
    },
    {
      id: 'obsat-mass', kind: 'mass', maxG: 250, severity: 'error',
      title: 'Massa do payload ≤ 250 g',
      detail: 'A soma das massas dos componentes não pode ultrapassar o limite do edital.',
    },
    {
      id: 'obsat-logging', kind: 'capability', capability: 'storage', mode: 'any', severity: 'info',
      title: 'Backup de dados recomendado',
      detail: 'Gravar os dados localmente (cartão SD) protege a missão contra perda de enlace.',
      suggest: ['sd_card'],
    },
  ],
}

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
      suggest: ['bme280', 'mpu6050'],
    },
  ],
}

export const FRAMEWORKS = { [OBSAT.id]: OBSAT, [CUSTOM.id]: CUSTOM }
export const FRAMEWORK_LIST = [OBSAT, CUSTOM]
export const getFramework = (id) => FRAMEWORKS[id] || null
