// ──────────────────────────────────────────────────────────────────
// Debug tool registry — the modular debug engine.
//
// Mirrors the mission engines' contract: PURE (no store/UI import), so it
// unit-tests in isolation and the UI is a thin renderer of its output. A
// debug tool is a small module `{ id, group, label, desc, run(ctx) }` where
// run(ctx) -> { status, summary, details: [{label, value, tone?}] }. New
// tools register by pushing to DEBUG_TOOLS (or `registerDebugTool`), so the
// Debug section grows without touching the panel — separation of concerns.
//
// ctx = { entities, defs, live, missionPlan } — all already in the store.
// ──────────────────────────────────────────────────────────────────

export const DSTATUS = { OK: 'ok', WARN: 'warn', ERR: 'err', IDLE: 'idle' }

// Groups give the panel its structure. `planned` groups are scaffolding for
// future tool families (architecture now, implementation later) — they render
// as "em breve" so the extension points are visible and intentional.
export const DEBUG_GROUPS = [
  { id: 'bus', label: 'Barramentos', desc: 'Integridade de I²C / SPI / UART' },
  { id: 'power', label: 'Energia', desc: 'Orçamento de corrente e alimentação' },
  { id: 'wiring', label: 'Fiação & pinos', desc: 'Conflitos de pino e endereço' },
  { id: 'bringup', label: 'Bring-up', desc: 'Prontidão para subir no hardware real' },
  // ── planned tool families (registered later via registerDebugTool) ──
  // 'logs' graduated from planned: the Log Doctor assistant lives there.
  { id: 'logs', label: 'Assistente de depuração', desc: 'Diagnóstico por log do dispositivo + gêmeo digital' },
  { id: 'unit', label: 'Testes unitários', desc: 'Testes por componente', planned: true },
  { id: 'groups', label: 'Testes de grupo', desc: 'Grupos de sensores / módulos', planned: true },
  { id: 'runtime', label: 'Validação em runtime', desc: 'Validações ao vivo durante a missão', planned: true },
]

// ── helpers (pure) ──────────────────────────────────────────────────
const entityList = (ctx) => Object.values(ctx.entities || {})
const i2cDevices = (ctx) => entityList(ctx).filter((e) => e.def?.protocol === 'I2C')

// ── seed tools (real, derived from live store state) ────────────────
function i2cTool(ctx) {
  const devs = i2cDevices(ctx)
  if (!devs.length) return { status: DSTATUS.IDLE, summary: 'nenhum dispositivo I²C no projeto', details: [] }
  const counts = {}
  devs.forEach((d) => { const a = d.def.address; if (a) counts[a] = (counts[a] || 0) + 1 })
  const dupes = Object.entries(counts).filter(([, n]) => n > 1).map(([a]) => a)
  const details = [{ label: 'barramento', value: 'SDA GPIO21 · SCL GPIO22' }]
  devs.forEach((d) => details.push({
    label: d.def.friendly || d.def.label,
    value: d.def.address || '—',
    tone: dupes.includes(d.def.address) ? DSTATUS.ERR : DSTATUS.OK,
  }))
  return dupes.length
    ? { status: DSTATUS.ERR, summary: `conflito de endereço em ${dupes.join(', ')}`, details }
    : { status: DSTATUS.OK, summary: `${devs.length} dispositivo(s) I²C · endereços únicos`, details }
}

function powerTool(ctx) {
  const eco = ctx.live?.eco || { currentmA: 0, massG: 0 }
  const list = entityList(ctx)
  const hasMcu = list.some((e) => e.def?.category === 'mcu')
  const hasPwr = list.some((e) => e.def?.category === 'power')
  const status = !hasMcu ? DSTATUS.ERR : !hasPwr ? DSTATUS.WARN : DSTATUS.OK
  return {
    status,
    summary: status === DSTATUS.OK ? 'alimentação coerente' : (!hasMcu ? 'sem MCU no projeto' : 'sem fonte de energia dedicada'),
    details: [
      { label: 'corrente total', value: `${(eco.currentmA || 0).toFixed(0)} mA` },
      { label: 'massa', value: `${eco.massG || 0} g` },
      { label: 'MCU', value: hasMcu ? 'presente' : 'ausente', tone: hasMcu ? DSTATUS.OK : DSTATUS.ERR },
      { label: 'fonte', value: hasPwr ? 'presente' : 'ausente', tone: hasPwr ? DSTATUS.OK : DSTATUS.WARN },
    ],
  }
}

function wiringTool(ctx) {
  const issues = (ctx.live?.validation?.issues || []).filter((i) => i.source === 'wiring')
  const pinCount = Object.keys(ctx.live?.pins || {}).length
  if (!issues.length) {
    return { status: DSTATUS.OK, summary: 'sem conflitos de fiação', details: [{ label: 'componentes com pinos', value: String(pinCount) }] }
  }
  const worst = issues.some((i) => i.severity === 'error') ? DSTATUS.ERR : DSTATUS.WARN
  return {
    status: worst,
    summary: `${issues.length} problema(s) de fiação`,
    details: issues.map((i) => ({ label: i.title, value: i.severity === 'error' ? 'erro' : 'aviso', tone: i.severity === 'error' ? DSTATUS.ERR : DSTATUS.WARN })),
  }
}

function bringupTool(ctx) {
  const list = entityList(ctx)
  const hasMcu = list.some((e) => e.def?.category === 'mcu')
  const sensors = list.filter((e) => e.def?.category === 'sensor').length
  const errs = ctx.live?.validation?.summary?.errors || 0
  const ready = hasMcu && sensors > 0 && errs === 0
  return {
    status: ready ? DSTATUS.OK : (hasMcu ? DSTATUS.WARN : DSTATUS.ERR),
    summary: ready ? 'pronto para gravar no ESP32 real (aba Serial Test)' : (!hasMcu ? 'adicione um MCU' : errs > 0 ? 'resolva os erros antes de gravar' : 'adicione ao menos um sensor'),
    details: [
      { label: 'MCU', value: hasMcu ? 'ok' : 'faltando', tone: hasMcu ? DSTATUS.OK : DSTATUS.ERR },
      { label: 'sensores', value: String(sensors), tone: sensors > 0 ? DSTATUS.OK : DSTATUS.WARN },
      { label: 'erros de validação', value: String(errs), tone: errs > 0 ? DSTATUS.ERR : DSTATUS.OK },
    ],
  }
}

export const DEBUG_TOOLS = [
  { id: 'i2c_scan', group: 'bus', label: 'Varredura de barramento I²C', desc: 'Lista dispositivos I²C e detecta conflitos de endereço.', run: i2cTool },
  { id: 'power_budget', group: 'power', label: 'Orçamento de energia', desc: 'Soma de corrente e checagem de MCU/alimentação.', run: powerTool },
  { id: 'wiring_check', group: 'wiring', label: 'Conflitos de fiação e pinos', desc: 'Problemas de fiação reportados pelo motor de pinos.', run: wiringTool },
  { id: 'bringup_ready', group: 'bringup', label: 'Prontidão de bring-up', desc: 'MCU + sensores + sem erros = pronto para gravar.', run: bringupTool },
  // Interactive tool: `ui` tells the panel to render a dedicated card
  // (the registry stays pure — no JSX here). Engine: src/debug/logDoctor.js
  {
    id: 'log_doctor', group: 'logs', ui: 'logdoctor',
    label: 'Diagnóstico por log',
    desc: 'Cole a saída serial do dispositivo: o assistente cruza os sintomas com o estado real do projeto e aponta a causa provável com correção sugerida.',
    run: () => ({ status: DSTATUS.IDLE, summary: 'aguardando log para analisar', details: [] }),
  },
]

// Extension seam: future tool families call this to plug in without touching
// the panel or the existing tools.
export function registerDebugTool(tool) {
  if (!DEBUG_TOOLS.some((t) => t.id === tool.id)) DEBUG_TOOLS.push(tool)
  return tool
}

export const toolsForGroup = (groupId) => DEBUG_TOOLS.filter((t) => t.group === groupId)

export function runDebugTool(tool, ctx) {
  try { return tool.run(ctx) }
  catch (e) { return { status: DSTATUS.ERR, summary: `erro ao executar: ${e.message}`, details: [] } }
}
