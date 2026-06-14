// ──────────────────────────────────────────────────────────────────
// Mission consultant — the engine behind the guided mission-definition
// flow (Part 2 of the redesign).
//
// NOT a chat box: a structured flow asks targeted questions, and after
// each answer this engine returns immediate contextual feedback —
// implications the team may not have considered, relevant constraints,
// and an early DRAFT component list — so the user reaches Hardware with
// a populated board, not a blank one.
//
// Same async provider seam as runCopilot / runLogDoctor / runAssistant:
//   · 'local'     — pure heuristics (reuses recommendations.js); offline,
//                   no key, always available.
//   · 'anthropic' — POSTs to the backend /consult route, which holds
//                   ANTHROPIC_API_KEY server-side (model claude-opus-4-8)
//                   and answers as a senior CubeSat/CanSat systems
//                   engineer. Falls back to local on any failure.
//
// Pure: catalog (`defs`) injected; no store/UI imports.
// ──────────────────────────────────────────────────────────────────

import { analyzeText, recommend, environmentalRisks, estimatePower } from './recommendations.js'

// System prompt for the live consultant (used by the backend when wired).
// Kept here so the persona lives in one place, next to the local engine.
export const CONSULTANT_SYSTEM_PROMPT = `Você é o consultor de engenharia de sistemas do FORGE, uma plataforma para equipes universitárias que constroem nanossatélites (CubeSat, CanSat, PocketQube) para a OBSAT (Olimpíada Brasileira de Satélites) e projetos afins.

Seu papel: ajudar a equipe a tomar BOAS DECISÕES DE ENGENHARIA — tradeoffs de massa, volume, energia e orçamento — não apenas responder perguntas. Antecipe implicações que a equipe pode não ter considerado.

Contexto técnico que você domina:
- OBSAT Fase 2: telemetria obrigatória por WiFi (HTTP/JSON) a cada 4 min por ≥2 h, com bateria, temperatura, pressão, giroscópio e acelerômetro (3 eixos) e dados da missão; dados armazenados em memória; limites de massa por formato (CubeSat 455 g, CanSat 355 g, PocketQube 185 g).
- Componentes suportados hoje na plataforma: ESP32-WROOM-32D (computador de bordo, WiFi), BMP280 (temperatura+pressão, I²C), MPU6050 (giroscópio+acelerômetro, I²C).

Regras:
- Português do Brasil, direto e técnico, sem condescendência. Trate o usuário como estudante capaz.
- Quando recomendar componentes, use apenas os suportados (ESP32, BMP280, MPU6050) e diga o porquê em uma frase.
- Se a situação da equipe indicar restrição (orçamento apertado, equipe pequena, projetos paralelos, pouca experiência), priorize a configuração mais simples que cumpra os requisitos e diga isso claramente.
- Seja conciso: 2 a 4 frases por resposta.`

const SUPPORTED = new Set(['esp32', 'bmp280', 'mpu6050'])

// The ordered question flow. Each step declares what it collects and an
// `isComplete(plan)` predicate so the UI can drive progress without logic.
export const CONSULTANT_STEPS = [
  { id: 'context',     label: 'Contexto',     hint: 'Competição ou projeto', isComplete: (p) => !!p.kind },
  { id: 'competition', label: 'Competição',   hint: 'OBSAT e afins',         isComplete: (p) => p.kind !== 'competition' || !!p.frameworkId },
  { id: 'format',      label: 'Formato',      hint: 'CubeSat / CanSat / PocketQube', isComplete: (p) => !!p.format },
  { id: 'objective',   label: 'Objetivo',     hint: 'O que o satélite faz',   isComplete: (p) => !!p.objectiveId || !!(p.custom?.description || '').trim() },
  { id: 'team',        label: 'Equipe',       hint: 'Composição e contexto',  isComplete: (p) => !!(p.team?.name || '').trim() },
  { id: 'constraints', label: 'Restrições',   hint: 'Orçamento e prioridades', isComplete: (p) => p.budgetBRL != null || !!(p.priorities || '').trim() },
  { id: 'identity',    label: 'Identidade',   hint: 'Nome da missão',          isComplete: (p) => (p.name || '').trim().length >= 2 },
]

// ── local heuristic responder ──────────────────────────────────────
// Turns the plan + the free-text objective/team-situation into contextual
// feedback: a short reply, a draft component list, and warnings.
function localConsult({ defs, plan = {}, framework = null }) {
  const objectiveText = plan.custom?.description || ''
  const situation = plan.team?.situationText || ''
  const text = [objectiveText, situation].join(' · ')

  // draft components from the objective text + framework gaps
  const fromText = analyzeText(objectiveText, defs).components.map(c => c.id)
  const fromRec = recommend({ defs, plan, framework }).missing.map(m => m.id)
  const draft = [...new Set(['esp32', ...fromText, ...fromRec])].filter(id => SUPPORTED.has(id))

  const warnings = []
  // team-situation heuristics — the "thinks alongside you" part
  const s = situation.toLowerCase()
  if (/\bparalel|outro projeto|dois projetos|vários projetos|varios projetos/.test(s))
    warnings.push('Projetos em paralelo dividem o tempo da equipe — comece pela configuração mínima (ESP32 + BMP280) e só então acrescente sensores.')
  if (/\bpequena|poucos|2 pessoas|duas pessoas|3 pessoas|sozinh/.test(s))
    warnings.push('Equipe pequena: priorize menos subsistemas e mais testes. Cada sensor extra é mais fiação e mais firmware para validar.')
  if (/\bsem experi|primeira vez|iniciante|nunca|aprendendo/.test(s))
    warnings.push('Sem experiência prévia: o caminho ESP32 + BMP280 + MPU6050 no barramento I²C cobre o pacote OBSAT com o mínimo de risco.')
  if (/\bbarat|sem dinheiro|orçamento apertado|orcamento apertado|pouco dinheiro|limitad/.test(s))
    warnings.push('Orçamento apertado: os três sensores suportados somam pouco — o maior custo costuma ser estrutura e bateria, fora do escopo eletrônico.')

  for (const r of environmentalRisks(text)) warnings.push(`${r.title}: ${r.detail}`)

  const power = estimatePower({ defs, componentIds: draft })

  // a short, plan-aware reply
  const fmt = plan.format ? plan.format : 'CubeSat'
  let reply
  if (!objectiveText.trim()) {
    reply = 'Descreva em uma frase o que o satélite deve medir ou fazer e eu sugiro os sensores e os tradeoffs do formato escolhido.'
  } else {
    const names = draft.map(id => defs[id]?.friendly || id).join(', ')
    reply = `Para esse objetivo em um ${fmt}, um ponto de partida sólido é: ${names}. ` +
      `Estimo ~${power.currentmA} mA de consumo. Refine pela telemetria obrigatória da OBSAT (temperatura, pressão, giroscópio, acelerômetro).`
  }

  return { reply, draft, warnings }
}

// Async provider seam — same shape as runCopilot / runAssistant.
export async function runConsultant(input, { provider = 'local', endpoint } = {}) {
  if (provider === 'anthropic') {
    try { return await anthropicConsult(input, { endpoint }) } catch { /* fall back offline */ }
  }
  return localConsult(input)
}

// Live provider: the key lives on the BACKEND, so the browser only calls
// our own server. The local heuristic still computes the draft + warnings
// (so the digital twin stays the source of truth); the model only enriches
// the prose `reply`. Until the route exists this throws and we fall back.
async function anthropicConsult(input, { endpoint }) {
  const local = localConsult(input)
  const { plan = {} } = input
  const userMsg = [
    `Formato: ${plan.format || 'CubeSat'}`,
    `Competição: ${plan.frameworkId || 'nenhuma'}`,
    `Objetivo: ${plan.custom?.description || plan.objectiveId || '—'}`,
    `Equipe: ${plan.team?.name || '—'} · situação: ${plan.team?.situationText || '—'}`,
    `Orçamento: ${plan.budgetBRL != null ? `R$ ${plan.budgetBRL}` : '—'}`,
  ].join('\n')

  const res = await fetch(endpoint || 'http://localhost:3001/consult', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system: CONSULTANT_SYSTEM_PROMPT, message: userMsg }),
  })
  if (!res.ok) throw new Error(`consult backend ${res.status}`)
  const data = await res.json()
  // keep the twin-derived draft + warnings; use the model's prose reply
  return { ...local, reply: (data.text || '').trim() || local.reply, provider: 'anthropic' }
}
