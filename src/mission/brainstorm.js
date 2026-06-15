// ──────────────────────────────────────────────────────────────────
// Brainstorming workspace — domain model + suggestion engine (Prompt A
// Part 3). PURE: no store/UI imports. Synthesised from FMEA (failure mode
// & effects analysis) as used in aerospace, design-thinking ideation
// boards (FigJam/Miro), and the NASA SE Handbook's requirements/trade-
// study framing, scaled down for first-time university satellite teams.
//
// The five zones map to a lightweight systems-engineering ideation pass:
//   objectives  → mission objectives & science questions (what & why)
//   constraints → technical constraints & risks (the box we build in)
//   failures    → potential failure modes (FMEA seed)
//   questions   → open questions & unknowns (what we must still resolve)
//   ideas       → ideas to explore (divergent options)
//
// AI suggestions run on the FREE local heuristic below (mission-context
// aware) so there is no API cost; the same shape can later be produced by
// a server-side LLM behind the existing assistant seam.
// ──────────────────────────────────────────────────────────────────

// canvas layout (shared by the brainstorm canvas + the challenge-board
// seeding so seeded cards land inside the right zone)
export const VW = 1600, VH = 1020
export const ZONE_RECT = {
  objectives: { x: 40, y: 40, w: 480, h: 430 },
  constraints: { x: 560, y: 40, w: 480, h: 430 },
  failures: { x: 1080, y: 40, w: 480, h: 430 },
  questions: { x: 40, y: 510, w: 740, h: 470 },
  ideas: { x: 820, y: 510, w: 740, h: 470 },
}
export const CARD_W = 196, CARD_H = 78

export const BRAINSTORM_ZONES = [
  { id: 'objectives', label: 'Objetivos & perguntas científicas', hint: 'O que a missão quer descobrir ou provar.', color: '#2B6CB0' },
  { id: 'constraints', label: 'Restrições técnicas & riscos', hint: 'Limites de massa, energia, orçamento, prazo.', color: '#A8691A' },
  { id: 'failures', label: 'Modos de falha (FMEA)', hint: 'O que pode dar errado — e como detectar.', color: '#B23A22' },
  { id: 'questions', label: 'Perguntas em aberto & incógnitas', hint: 'O que ainda precisamos resolver.', color: '#6E3490' },
  { id: 'ideas', label: 'Ideias a explorar', hint: 'Opções divergentes — nada é errado aqui.', color: '#2E7A4F' },
]
export const ZONE_BY_ID = Object.fromEntries(BRAINSTORM_ZONES.map(z => [z.id, z]))

// per-objective-category knowledge — feeds context-specific suggestions
const BY_CATEGORY = {
  atmospheric: {
    objectives: ['Como variam temperatura e pressão com a altitude?', 'Mapear o perfil atmosférico durante a subida'],
    failures: ['BMP280 sem resposta no barramento I²C', 'Leituras de pressão saturadas fora da faixa'],
    ideas: ['Registrar dados em SD como redundância ao downlink'],
  },
  earth_obs: {
    objectives: ['Capturar imagens da superfície em pontos-chave da órbita'],
    failures: ['Câmera com buffer estourado / quadros corrompidos', 'Borrão por rotação não controlada do satélite'],
    questions: ['Qual resolução cabe no orçamento de downlink?'],
  },
  communication: {
    objectives: ['Validar o enlace de telemetria em diferentes distâncias'],
    failures: ['Falha de implantação da antena', 'Perda de enlace por baixa relação sinal-ruído'],
    ideas: ['Protocolo com reenvio de pacotes perdidos'],
  },
  radiation: {
    objectives: ['Medir dose de radiação acumulada em órbita'],
    failures: ['SEU/latch-up no microcontrolador por radiação', 'Contador Geiger saturando em pico de radiação'],
  },
  attitude_control: {
    objectives: ['Estimar a atitude do satélite a partir do IMU'],
    failures: ['Deriva do giroscópio sem calibração', 'MPU6050 e outro sensor em conflito de endereço I²C'],
    questions: ['Precisamos de controle ativo ou só determinação de atitude?'],
  },
  biological: {
    objectives: ['Manter e monitorar a amostra biológica em órbita'],
    failures: ['Falha de controle térmico da carga biológica'],
  },
  tech_demo: {
    objectives: ['Demonstrar o subsistema novo funcionando em voo'],
    failures: ['Componente de demonstração sem heritage de voo falha cedo'],
  },
}

// generic CubeSat fallbacks per zone (always relevant)
const GENERIC = {
  objectives: ['Definir o critério de sucesso mínimo da missão', 'Listar os dados que comprovam o objetivo'],
  constraints: ['Massa total dentro do limite do formato', 'Orçamento de energia fecha com os painéis solares?', 'Cumprir o prazo da competição'],
  failures: ['Falha de energia / brownout do barramento', 'Contenção no barramento I²C entre sensores', 'Reset em loop por subtensão', 'Estouro de orçamento na eletrônica'],
  questions: ['Quem é responsável por cada subsistema?', 'Como validamos cada sensor antes da integração?', 'Qual o plano B se um componente atrasar?'],
  ideas: ['Começar com um protótipo em protoboard', 'Reuso de firmware de missões anteriores', 'Registrar tudo em log para depuração'],
}

// Return 2–4 zone-relevant suggestion strings from the mission context.
// ctx = { categories:[id], cubeU, budgetBRL, teamSize, framework }
export function suggestForZone(zoneId, ctx = {}) {
  const cats = ctx.categories || []
  const out = []
  for (const c of cats) {
    const k = BY_CATEGORY[c]?.[zoneId]
    if (k) out.push(...k)
  }
  out.push(...(GENERIC[zoneId] || []))

  // context-flavoured extras
  if (zoneId === 'constraints') {
    if (ctx.budgetBRL != null) out.unshift(`Caber no orçamento de R$${ctx.budgetBRL}`)
    if (ctx.cubeU) out.push(`Volume e massa do formato ${ctx.cubeU}`)
  }
  if (zoneId === 'questions' && (ctx.teamSize || 0) > 0) {
    out.push(`Dividir ${ctx.teamSize} integrante(s) entre os subsistemas`)
  }

  // de-dup, keep 2–4
  const seen = new Set()
  const uniq = out.filter(s => (seen.has(s) ? false : seen.add(s)))
  return uniq.slice(0, Math.min(4, Math.max(2, uniq.length)))
}
