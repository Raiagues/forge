// ──────────────────────────────────────────────────────────────────
// Mission copilot — the analysis layer.
//
// It composes the validation + recommendation engines into a single set
// of structured *findings* that the UI renders on demand. It never runs
// automatically and never interrupts; the user explicitly asks for it.
//
// Findings shape:
//   { id, kind, severity, title, detail, actions:[{ label, type:'add', componentId }] }
//   kind ∈ 'incompatibility' | 'missing' | 'suggestion' | 'tradeoff' | 'risk' | 'info'
//
// ── LLM PROVIDER SEAM ──────────────────────────────────────────────
// `runCopilot()` is async and provider-pluggable. The default provider
// is the local deterministic engine below (works offline, no keys). To
// back it with a real model, implement `anthropicProvider` — e.g. with
// @anthropic-ai/sdk, model 'claude-opus-4-8' — returning the same
// { summary, findings } shape, and pass { provider:'anthropic' }.
// Keeping this behind one function means the UI/store never change.
// ──────────────────────────────────────────────────────────────────

import { validateDesign, validateSoftware } from './validation.js'
import { recommend, analyzeText, estimatePower, environmentalRisks } from './recommendations.js'
import { hasCapability, defsForIds } from './capabilities.js'
import { SOFTWARE_MODULES } from './software.js'

let _uid = 0
const uid = (p) => `${p}-${_uid++}`

// Deterministic local analysis of the current design.
export function analyzeMission({ defs, framework, componentIds = [], plan = {} }) {
  const validation = validateDesign({ defs, framework, componentIds, plan })
  const findings = []

  // 1. incompatibilities / unmet requirements (errors → incompatibility, warns → risk)
  for (const issue of validation.issues) {
    findings.push({
      id: uid('val'),
      kind: issue.severity === 'error' ? 'incompatibility' : issue.severity === 'warn' ? 'risk' : 'info',
      severity: issue.severity,
      title: issue.title,
      detail: issue.detail,
      actions: (issue.suggestions || []).map((s) => ({ label: `Adicionar ${s.label}`, type: 'add', componentId: s.id })),
    })
  }

  // 2. software ↔ hardware coherence
  for (const sw of validateSoftware({ defs, componentIds, moduleIds: plan.software || [], modules: SOFTWARE_MODULES })) {
    findings.push({ id: uid('sw'), kind: 'risk', severity: 'warn', title: sw.title, detail: sw.detail, actions: [] })
  }

  // 3. objective-driven suggestions (parts that would help, not yet added)
  const rec = recommend({ defs, plan, framework })
  for (const m of rec.missing) {
    if ((plan.components || []).includes(m.id)) continue
    if (validation.issues.some((i) => (i.suggestions || []).some((s) => s.id === m.id))) continue // avoid dup with #1
    findings.push({
      id: uid('rec'),
      kind: 'suggestion', severity: 'info',
      title: `Considere ${m.label}`,
      detail: `Seus objetivos sugerem ${m.reason}. ${m.label} cobriria essa necessidade.`,
      actions: [{ label: `Adicionar ${m.label}`, type: 'add', componentId: m.id }],
    })
  }

  // 4. tradeoffs
  const design = defsForIds(defs, componentIds)
  const wifi = hasCapability(design, 'wifi')
  const lora = hasCapability(design, 'lora')
  if (wifi && !lora) findings.push({
    id: uid('to'), kind: 'tradeoff', severity: 'info',
    title: 'WiFi vs. alcance',
    detail: 'WiFi entrega alta taxa porém alcance curto. Para enlaces de vários km, LoRa complementa o WiFi com baixa taxa e longo alcance.',
    actions: defs.lora_sx1276 ? [{ label: 'Adicionar LoRa SX1276', type: 'add', componentId: 'lora_sx1276' }] : [],
  })
  if (lora && !wifi && framework?.id === 'obsat') findings.push({
    id: uid('to'), kind: 'tradeoff', severity: 'warn',
    title: 'LoRa não substitui WiFi no OBSAT',
    detail: 'O OBSAT exige WiFi para a estação base. LoRa pode ser um enlace secundário, mas não cumpre o requisito principal.',
    actions: [{ label: 'Adicionar ESP32 (WiFi)', type: 'add', componentId: 'esp32' }],
  })

  const power = estimatePower({ defs, componentIds })
  const summary = {
    headline: validation.ok
      ? `Projeto coerente: ${validation.summary.passed}/${validation.summary.rules} requisitos atendidos.`
      : `${validation.errors.length} incompatibilidade(s) crítica(s) e ${validation.warnings.length} aviso(s).`,
    validation, power,
    counts: {
      incompatibilities: findings.filter((f) => f.kind === 'incompatibility').length,
      risks: findings.filter((f) => f.kind === 'risk').length,
      suggestions: findings.filter((f) => f.kind === 'suggestion').length,
      tradeoffs: findings.filter((f) => f.kind === 'tradeoff').length,
    },
  }
  return { mode: 'analysis', summary, findings }
}

// NL analysis of a custom mission description.
export function analyzeDescription({ defs, framework, plan = {} }) {
  const text = plan.custom?.description || ''
  const parsed = analyzeText(text, defs)
  const findings = []

  for (const c of parsed.components) {
    const already = (plan.components || []).includes(c.id)
    findings.push({
      id: uid('nlp'),
      kind: 'suggestion', severity: already ? 'info' : 'info',
      title: `${c.label}${already ? ' (já no projeto)' : ''}`,
      detail: `Detectei "${c.reason}" na descrição — ${c.label} atende esse objetivo.`,
      actions: already ? [] : [{ label: `Adicionar ${c.label}`, type: 'add', componentId: c.id }],
    })
  }
  // always ensure core systems show up as suggestions
  const rec = recommend({ defs, plan: { ...plan, objectives: [text] }, framework })
  for (const m of rec.missing) {
    if (parsed.components.some((c) => c.id === m.id) || (plan.components || []).includes(m.id)) continue
    findings.push({
      id: uid('nlp'), kind: 'suggestion', severity: 'info',
      title: `${m.label}`,
      detail: `Sistema ${m.reason} recomendado para uma missão viável.`,
      actions: [{ label: `Adicionar ${m.label}`, type: 'add', componentId: m.id }],
    })
  }

  for (const r of environmentalRisks(`${text} ${plan.environment?.notes || ''} ${plan.environment?.altitude || ''}`)) {
    findings.push({ id: uid('risk'), kind: 'risk', severity: 'warn', title: r.title, detail: r.detail, actions: [] })
  }

  const proposedIds = [...new Set([...(plan.components || []), ...parsed.components.map((c) => c.id), ...rec.missing.map((m) => m.id)])]
  const power = estimatePower({ defs, componentIds: proposedIds })

  return {
    mode: 'custom',
    summary: {
      headline: parsed.components.length
        ? `Análise da descrição: ${parsed.components.length} sensor(es)/sistema(s) identificado(s).`
        : 'Descreva sensores, ambiente e metas para uma análise mais rica.',
      power,
      counts: { suggestions: findings.filter((f) => f.kind === 'suggestion').length, risks: findings.filter((f) => f.kind === 'risk').length },
    },
    findings,
  }
}

// Provider-pluggable async entry point (see seam note at top of file).
export async function runCopilot(input, { provider = 'local', mode = 'analysis' } = {}) {
  if (provider === 'anthropic') {
    // return anthropicProvider(input, mode)   // implement with @anthropic-ai/sdk
    throw new Error('anthropic provider not configured — using local engine')
  }
  // simulate async so the UI can show a "thinking" state and a real model
  // can later slot in without changing call sites.
  await Promise.resolve()
  return mode === 'custom' ? analyzeDescription(input) : analyzeMission(input)
}
