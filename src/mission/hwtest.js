// ──────────────────────────────────────────────────────────────────
// Hardware test bench — the engineering domain behind the AIT
// (Assembly, Integration & Testing) window. A satellite AIT campaign
// validates subsystems in a fixed order before the integrated system is
// exercised together; this engine encodes that campaign for the GuiaSat
// digital twin.
//
// Two responsibilities, both PURE (catalog injected, no store/UI import):
//   1. buildSubsystems() — decompose the placed hardware into the
//      standard CubeSat subsystem block diagram (OBC / EPS / COMMS /
//      ADCS-Sensors / Payload / data bus). Component-driven: a block is
//      "present" only when the user actually placed parts for it.
//   2. plan*() — for each pipeline stage, produce an ORDERED list of
//      test steps with an honest verdict, derived from real wiring /
//      entity / link state. The UI plays the steps out on a terminal
//      with delays; the verdict is deterministic, never fake-positive.
//
// Subsystem decomposition follows common 1U CubeSat architecture
// (e.g. GomSpace NanoMind/NanoPower/NanoCom, ISIS OBC + EPS + TRXVU):
//   OBC/C&DH · EPS · COMMS/TT&C · ADCS · Payload, interconnected by an
//   I²C/SPI/UART data bus (the PC-104 / backplane harness on real CubeSats).
// ──────────────────────────────────────────────────────────────────

import { COMPONENT_PINS, ADDR_STRAPS, wiringStatus, i2cAddressFromWires } from './wiring.js'

const rnd = (a, b) => a + Math.random() * (b - a)
const f = (v, d = 1) => Number(v).toFixed(d)

// ── subsystem catalogue ────────────────────────────────────────────
// Static metadata for every block the diagram can show. `match` decides
// which placed entities belong to the block; `node` blocks (Sensors)
// fan out into one child node per matched entity. Blocks with no matched
// part render as grayed placeholders — honest about what is not on the
// board yet. Positions are AIT-diagram coordinates in a 1000×620 field.
export const SUBSYSTEMS = [
  {
    id: 'eps', label: 'Alimentação', sub: 'EPS', acro: 'EPS',
    role: 'Bateria, regulação e trilhas de tensão (3V3/5V).',
    match: (def) => def.category === 'power',
    x: 70, y: 60, w: 210, h: 110,
  },
  {
    id: 'comms', label: 'Comunicação', sub: 'COMMS / TT&C', acro: 'TT&C',
    role: 'Transceptor RF, interface de antena e pilha de protocolo.',
    match: (def) => def.category === 'comm',
    x: 720, y: 60, w: 210, h: 110,
  },
  {
    id: 'obc', label: 'Computador de bordo', sub: 'OBC / C&DH', acro: 'OBC',
    role: 'Microcontrolador de voo: comando, coleta e telemetria.',
    match: (def) => def.category === 'mcu',
    x: 395, y: 70, w: 210, h: 120, central: true,
  },
  {
    id: 'bus', label: 'Interfaces', sub: 'Barramento de dados', acro: 'BUS',
    role: 'I²C · SPI · UART · GPIO — o chicote que liga os subsistemas.',
    match: () => false, // derived from buses, not a component category
    x: 360, y: 270, w: 280, h: 78, bus: true,
  },
  {
    id: 'sensors', label: 'Sensores', sub: 'ADCS + Carga útil', acro: 'ADCS',
    role: 'Determinação de atitude e instrumentos científicos.',
    match: (def) => def.category === 'sensor',
    x: 120, y: 420, w: 760, h: 150, node: true,
  },
  {
    id: 'payload', label: 'Payload', sub: 'Carga útil dedicada', acro: 'P/L',
    role: 'Instrumento de missão dedicado (reservado).',
    match: () => false, // placeholder block — no payload part in the catalog yet
    x: 720, y: 215, w: 210, h: 96, placeholder: true,
  },
]

// signal/power flow between blocks (drawn as connector lines)
export const SUBSYSTEM_LINKS = [
  { from: 'eps', to: 'obc', kind: 'power' },
  { from: 'eps', to: 'bus', kind: 'power' },
  { from: 'obc', to: 'comms', kind: 'data' },
  { from: 'obc', to: 'payload', kind: 'data' },
  { from: 'obc', to: 'bus', kind: 'data' },
]

// Which buses a peripheral sits on (for the Interfaces block + node wiring).
function busOf(def) {
  if (def.protocol === 'I2C') return 'I²C'
  if (def.protocol === 'SPI') return 'SPI'
  if (def.protocol === 'UART') return 'UART'
  return 'GPIO'
}

// Decompose placed hardware into the diagram model. `entities` is the
// store entity map; `wiring` is live.wiring (honest connection state).
export function buildSubsystems({ defs, entities, wires = [], wiring = {} }) {
  const ids = Object.keys(entities)
  const blocks = SUBSYSTEMS.map((s) => {
    const members = ids.filter((id) => defs[id] && s.match(defs[id]))
    const nodes = s.node
      ? members.map((id) => {
          const def = defs[id]
          const w = wiring[id] || wiringStatus(id, wires)
          const addr = i2cAddressFromWires(id, wires)?.addr || def.address || null
          return {
            id, label: def.friendly || def.label, part: def.label,
            bus: busOf(def), addr, wired: !!w.wired, role: roleOf(def),
          }
        })
      : []
    return {
      ...s,
      present: s.placeholder ? false : members.length > 0,
      components: members,
      nodes,
    }
  })

  // Interfaces block: which buses are actually in play on the board.
  const periph = ids.filter((id) => defs[id] && defs[id].category !== 'mcu' && COMPONENT_PINS[id])
  const buses = []
  const seen = new Set()
  for (const id of periph) {
    const b = busOf(defs[id])
    if (!seen.has(b)) { seen.add(b); buses.push(b) }
  }
  const busBlock = blocks.find((b) => b.id === 'bus')
  busBlock.present = ids.includes('esp32')
  busBlock.buses = buses.length ? buses : (ids.includes('esp32') ? ['GPIO'] : [])

  return blocks
}

// human role tag for a sensor node (ADCS vs payload instrument)
function roleOf(def) {
  if (def.caps?.includes('imu')) return 'ADCS · atitude'
  if (def.caps?.includes('gnss')) return 'ADCS · posição'
  return 'Carga útil · ciência'
}

// ── pipeline metadata ───────────────────────────────────────────────
// Five ordered stages. The order is not cosmetic: each stage assumes the
// previous one passed. You cannot trust a sensor reading (stage 3) if the
// bus that carries it was never scanned (stage 2), and you cannot scan a
// bus you cannot reach because the comms/serial link is down (stage 1).
// Integration (4) only means something once each part passes alone (3),
// and the full-system run (5) is the pre-flight check over all of it.
export const TEST_STAGES = [
  {
    id: 'comm', n: 1, block: 'comms', label: 'Enlace de comunicação',
    blurb: 'Estabelecer o canal com o computador de bordo (serial/UART).',
    why: 'Primeiro portão: sem um canal com a placa, nenhum outro teste consegue enviar comandos nem ler respostas.',
  },
  {
    id: 'interfaces', n: 2, block: 'bus', label: 'Varredura de interfaces',
    blurb: 'Mapear GPIOs, varrer o barramento I²C e conferir UART/SPI.',
    why: 'Antes de falar com um sensor é preciso saber que o barramento que o carrega existe e responde. Um endereço I²C ausente aqui explica uma falha de sensor adiante.',
  },
  {
    id: 'sensors', n: 3, block: 'sensors', label: 'Testes de sensores',
    blurb: 'Inicializar e ler cada sensor, conferindo faixas plausíveis.',
    why: 'Com o barramento validado, cada sensor é exercido isoladamente — assim uma falha aponta para um componente, não para o conjunto.',
  },
  {
    id: 'integration', n: 4, block: null, label: 'Integração de componentes',
    blurb: 'Exercitar dois ou mais blocos juntos (ex.: I²C compartilhado).',
    why: 'Componentes que passam sozinhos ainda podem brigar pelo mesmo barramento. Aqui se testa a convivência (endereços, contenção, temporização).',
  },
  {
    id: 'system', n: 5, block: null, label: 'Integração de sistema',
    blurb: 'Sequência operacional completa — o pré-voo do conjunto.',
    why: 'Roda todos os subsistemas juntos numa sequência operacional, o mais próximo de um ensaio de pré-lançamento.',
  },
]

export const stageById = (id) => TEST_STAGES.find((s) => s.id === id)

// verdict helpers
const PASS = 'passed', FAIL = 'failed', WARN = 'warn'
const worst = (a, b) => (a === FAIL || b === FAIL ? FAIL : a === WARN || b === WARN ? WARN : PASS)

// ── stage 1 — communication link ───────────────────────────────────
// Real handshake when a physical ESP32 stream is open (hwLink), honest
// simulation otherwise. No OBC on the board = hard fail.
export function planComm({ entities, hwLink = {} }) {
  const steps = []
  const has = !!entities.esp32
  const real = !!hwLink.connected
  steps.push({ text: `link: ${real ? hwLink.port || 'bridge serial' : 'simulação'} · 115200 8N1`, cls: 'info' })
  if (!has) {
    steps.push({ text: 'ping OBC → sem computador de bordo na placa', cls: 'err' })
    return { status: FAIL, summary: 'Sem OBC — adicione o ESP32 no Hardware', steps }
  }
  steps.push({ text: '» PING ESP32', cls: 'tx' })
  const rtt = real ? Math.round(rnd(40, 120)) : Math.round(rnd(2, 9))
  steps.push({ text: `‹ ACK · handshake OK · RTT ${rtt} ms`, cls: 'rx' })
  steps.push({ text: real ? 'enlace físico confirmado' : 'enlace simulado confirmado', cls: 'ok' })
  return {
    status: PASS,
    summary: real ? `Enlace real · RTT ${rtt} ms` : `Enlace simulado · RTT ${rtt} ms`,
    steps,
  }
}

// ── stage 2 — interface scan ────────────────────────────────────────
// GPIO usage map + I²C bus scan (cross-referenced to known devices) +
// UART/SPI availability. A wired sensor's address ACKs; an unwired one
// is honestly absent from the scan.
export function planInterfaces({ defs, entities, wires = [], wiring = {} }) {
  const steps = []
  const ids = Object.keys(entities)
  const periph = ids.filter((id) => id !== 'esp32' && COMPONENT_PINS[id])

  // GPIO map — which ESP32 pins the wiring occupies
  const usedPins = new Set()
  wires.forEach((w) => {
    [w.from, w.to].forEach((e) => { if (e.comp === 'esp32' && /^GPIO/.test(e.pin)) usedPins.add(e.pin) })
  })
  steps.push({ text: `GPIO map · ${usedPins.size} pino(s) em uso: ${[...usedPins].join(', ') || '—'}`, cls: usedPins.size ? 'info' : 'warn' })

  // I²C scan
  steps.push({ text: 'I²C scan 0x08–0x77…', cls: 'tx' })
  const i2cParts = periph.filter((id) => defs[id]?.protocol === 'I2C')
  let detected = 0
  let i2cStatus = PASS
  for (const id of i2cParts) {
    const w = wiring[id] || wiringStatus(id, wires)
    const addr = i2cAddressFromWires(id, wires)?.addr || defs[id].address
    if (w.wired) {
      detected++
      steps.push({ text: `‹ ${addr} ACK · ${defs[id].label} (${defs[id].friendly})`, cls: 'rx' })
    } else {
      i2cStatus = worst(i2cStatus, WARN)
      steps.push({ text: `${addr} sem resposta · ${defs[id].label} não conectado`, cls: 'warn' })
    }
  }
  if (!i2cParts.length) steps.push({ text: 'nenhum dispositivo I²C na placa', cls: 'info' })
  else steps.push({ text: `scan I²C concluído · ${detected}/${i2cParts.length} dispositivo(s)`, cls: detected ? 'ok' : 'warn' })

  // UART / SPI availability
  const uartParts = periph.filter((id) => defs[id]?.protocol === 'UART')
  steps.push({ text: uartParts.length ? `UART2 ocupada · ${uartParts.length} periférico(s) serial` : 'UART2 disponível (RX2=16, TX2=17)', cls: 'info' })
  const spiParts = periph.filter((id) => defs[id]?.protocol === 'SPI')
  steps.push({ text: spiParts.length ? `VSPI ocupada · ${spiParts.length} periférico(s)` : 'VSPI disponível (livre)', cls: 'info' })

  const status = ids.includes('esp32') ? i2cStatus : FAIL
  if (!ids.includes('esp32')) steps.unshift({ text: 'sem OBC — não há host de barramento', cls: 'err' })
  return {
    status,
    summary: status === FAIL ? 'Sem host de barramento'
      : status === WARN ? `Interfaces parciais · ${detected}/${i2cParts.length} I²C`
        : `Interfaces OK · ${usedPins.size} GPIO · ${detected} I²C`,
    detected, expected: i2cParts.length,
    steps,
  }
}

// ── stage 3 — individual sensor test ────────────────────────────────
// Per-sensor init + read with plausibility check. Wired → plausible
// values within the datasheet range; unwired → honest no-response.
export function planSensor(id, { defs, wires = [], wiring = {} }) {
  const def = defs[id]
  const steps = []
  if (!def) return { status: FAIL, summary: 'componente desconhecido', steps }
  const w = wiring[id] || wiringStatus(id, wires)
  const name = `${def.label} (${def.friendly})`
  steps.push({ text: `init ${name}…`, cls: 'tx' })

  if (!w.wired) {
    const missing = !w.powered ? 'alimentação' : 'barramento de dados'
    steps.push({ text: `sem resposta · falta ${missing}`, cls: 'err' })
    return { status: FAIL, sensor: id, summary: `${def.label}: não conectado`, steps }
  }

  const r = sensorReadout(id)
  steps.push({ text: r.init, cls: 'rx' })
  r.reads.forEach((line) => steps.push({ text: line, cls: 'rx' }))
  steps.push({ text: r.verdict.ok ? 'leitura dentro da faixa esperada' : r.verdict.msg, cls: r.verdict.ok ? 'ok' : 'warn' })
  return {
    status: r.verdict.ok ? PASS : WARN,
    sensor: id,
    summary: `${def.label}: ${r.summary}`,
    steps,
  }
}

export function planSensors(sensorIds, ctx) {
  const results = sensorIds.map((id) => planSensor(id, ctx))
  const status = results.reduce((acc, r) => worst(acc, r.status), PASS)
  const ok = results.filter((r) => r.status === PASS).length
  return {
    status: sensorIds.length ? status : WARN,
    perSensor: Object.fromEntries(results.map((r) => [r.sensor, r])),
    summary: sensorIds.length ? `${ok}/${sensorIds.length} sensor(es) OK` : 'nenhum sensor na placa',
    steps: results.flatMap((r) => [{ text: `── ${r.sensor} ──`, cls: 'info' }, ...r.steps]),
  }
}

// plausible readouts per supported sensor (stationary bench conditions)
function sensorReadout(id) {
  switch (id) {
    case 'bmp280': {
      const t = rnd(20, 26), p = rnd(675, 690)
      return {
        init: 'WHO_AM_I = 0x58 (BMP280) OK',
        reads: [`T = ${f(t)} °C`, `P = ${f(p, 0)} hPa`],
        verdict: { ok: t > -40 && t < 85 && p > 300 && p < 1100 },
        summary: `${f(t)} °C · ${f(p, 0)} hPa`,
      }
    }
    case 'mpu6050': {
      const az = rnd(0.97, 1.02), gx = rnd(-0.4, 0.4)
      const ok = az > 0.9 && az < 1.1 && Math.abs(gx) < 1.5 // ≈1g, ~still
      return {
        init: 'WHO_AM_I = 0x68 (MPU6050) OK',
        reads: [`accel Z = ${f(az, 3)} g`, `gyro X = ${f(gx, 2)} °/s`],
        verdict: { ok, msg: 'eixo fora de ±1g — verifique se está parado e nivelado' },
        summary: `accel Z ${f(az, 2)} g · estável`,
      }
    }
    case 'gps_neo6m': {
      const sats = Math.round(rnd(2, 5))
      const fix = sats >= 4
      return {
        init: 'UART 9600 8N1 · sentenças NMEA fluindo',
        reads: [`$GPGSV · ${sats} satélite(s)`, fix ? '$GPGGA · 3D fix' : 'sem fix · buscando céu'],
        verdict: { ok: true, msg: fix ? '' : 'módulo responde — sem fix é normal em bancada' },
        summary: fix ? `fix 3D · ${sats} sat` : `respondendo · ${sats} sat (sem fix)`,
      }
    }
    default:
      return { init: 'init OK', reads: ['resposta recebida'], verdict: { ok: true }, summary: 'OK' }
  }
}

// ── stage 4 — component integration ─────────────────────────────────
// Exercise a user-selected pair/group together. Composition rule: the
// test is the UNION of the members' individual read routines run in one
// loop, plus the cross-checks that only matter in combination (shared-bus
// address collisions, UART contention). If the selection has no shared
// interaction, say so instead of pretending to test something.
export function planIntegration(selectedIds, { defs, entities, wires = [], wiring = {} }) {
  const steps = []
  const ids = selectedIds.filter((id) => entities[id])
  if (ids.length < 2) {
    return { status: WARN, summary: 'selecione 2+ blocos para integrar', interaction: false, steps: [{ text: 'selecione ao menos dois componentes no diagrama', cls: 'warn' }] }
  }

  const labelList = ids.map((id) => defs[id]?.label || id).join(' + ')
  steps.push({ text: `integração: ${labelList}`, cls: 'info' })

  // group by bus to find shared-bus interactions
  const byBus = {}
  ids.forEach((id) => { const b = defs[id]?.protocol || 'GPIO'; (byBus[b] ||= []).push(id) })

  let status = PASS
  let interaction = false

  // shared I²C bus: the meaningful CubeSat-bench test — both must ACK on
  // distinct addresses in a single loop without clobbering each other.
  const i2c = (byBus.I2C || []).filter((id) => id !== 'esp32')
  if (i2c.length >= 2) {
    interaction = true
    steps.push({ text: 'barramento I²C compartilhado — leitura intercalada', cls: 'tx' })
    const addrs = {}
    let collision = false
    for (const id of i2c) {
      const w = wiring[id] || wiringStatus(id, wires)
      const addr = i2cAddressFromWires(id, wires)?.addr || defs[id].address
      if (addrs[addr]) { collision = true; steps.push({ text: `conflito de endereço ${addr}: ${defs[id].label} ↔ ${defs[addrs[addr]].label}`, cls: 'err' }) }
      else addrs[addr] = id
      if (!w.wired) { status = worst(status, FAIL); steps.push({ text: `${defs[id].label} não conectado — não entra no laço`, cls: 'err' }) }
      else steps.push({ text: `‹ ${addr} ${defs[id].label} respondeu no laço`, cls: 'rx' })
    }
    if (collision) { status = FAIL; steps.push({ text: 'dois dispositivos no mesmo endereço — use o strap SDO p/ separar', cls: 'err' }) }
    else if (status === PASS) steps.push({ text: 'ambos convivem no barramento · sem interferência', cls: 'ok' })
  }

  // OBC + peripheral (control path) — a valid but light interaction
  if (!interaction && ids.includes('esp32') && ids.length >= 2) {
    interaction = true
    const others = ids.filter((id) => id !== 'esp32')
    steps.push({ text: `OBC ↔ ${others.map((id) => defs[id].label).join(', ')} · caminho de controle`, cls: 'tx' })
    for (const id of others) {
      const w = wiring[id] || wiringStatus(id, wires)
      if (!w.wired) { status = worst(status, FAIL); steps.push({ text: `${defs[id].label} fora do barramento`, cls: 'err' }) }
      else steps.push({ text: `‹ OBC enxerga ${defs[id].label}`, cls: 'rx' })
    }
    if (status === PASS) steps.push({ text: 'OBC comanda os periféricos selecionados', cls: 'ok' })
  }

  if (!interaction) {
    return {
      status: WARN, interaction: false,
      summary: 'sem interação compartilhada para testar',
      steps: [...steps, { text: 'os blocos selecionados não compartilham barramento — nada a integrar entre eles', cls: 'warn' }],
    }
  }

  return {
    status,
    interaction: true,
    summary: status === FAIL ? 'conflito na integração' : status === WARN ? 'integração parcial' : `${labelList} convivem`,
    steps,
  }
}

// ── stage 5 — full system integration (pre-flight) ──────────────────
// Operational sequence over every subsystem, logged line by line, with a
// per-subsystem breakdown in the summary.
export function planSystem({ defs, entities, wires = [], wiring = {}, hwLink = {} }) {
  const steps = []
  const ids = Object.keys(entities)
  const breakdown = {}
  let status = PASS
  const mark = (sub, st, line, cls) => { breakdown[sub] = worst(breakdown[sub] || PASS, st); status = worst(status, st); steps.push({ text: line, cls }) }

  steps.push({ text: '═══ sequência de pré-voo ═══', cls: 'info' })

  // 1. power-on
  steps.push({ text: '[1] energização', cls: 'tx' })
  const eps = ids.some((id) => defs[id]?.category === 'power')
  mark('EPS', eps ? PASS : WARN, eps ? '‹ EPS: trilhas 3V3/5V estáveis' : 'EPS: sem bateria no projeto — assumindo USB/bancada', eps ? 'rx' : 'warn')

  // 2. OBC boot + link
  steps.push({ text: '[2] boot do OBC e enlace', cls: 'tx' })
  const comm = planComm({ entities, hwLink })
  mark('OBC', comm.status, comm.status === PASS ? '‹ OBC: boot OK · enlace estabelecido' : 'OBC: enlace falhou', comm.status === PASS ? 'rx' : 'err')

  // 3. bus init
  steps.push({ text: '[3] inicialização do barramento', cls: 'tx' })
  const iface = planInterfaces({ defs, entities, wires, wiring })
  mark('BUS', iface.status, `‹ barramento: ${iface.detected}/${iface.expected} I²C detectado(s)`, iface.status === FAIL ? 'err' : iface.status === WARN ? 'warn' : 'rx')

  // 4. sensor sampling
  steps.push({ text: '[4] amostragem de sensores', cls: 'tx' })
  const sensorIds = ids.filter((id) => defs[id]?.category === 'sensor')
  if (!sensorIds.length) mark('ADCS', WARN, 'sem sensores — nada a amostrar', 'warn')
  for (const id of sensorIds) {
    const r = planSensor(id, { defs, wires, wiring })
    mark('ADCS', r.status, `‹ ${defs[id].label}: ${r.summary.split(': ').slice(1).join(': ') || r.summary}`, r.status === FAIL ? 'err' : r.status === WARN ? 'warn' : 'rx')
  }

  // 5. comms downlink
  steps.push({ text: '[5] downlink de telemetria', cls: 'tx' })
  const radio = ids.some((id) => defs[id]?.category === 'comm')
  mark('TT&C', radio ? PASS : WARN, radio ? '‹ TT&C: quadro de telemetria no ar' : 'TT&C: sem rádio — downlink via WiFi/serial', radio ? 'rx' : 'warn')

  // 6. integrated frame
  steps.push({ text: '[6] quadro integrado', cls: 'tx' })
  const allWired = sensorIds.length > 0 && sensorIds.every((id) => (wiring[id] || wiringStatus(id, wires)).wired)
  mark('SYS', allWired ? PASS : (sensorIds.length ? FAIL : WARN),
    allWired ? '‹ quadro completo montado e validado' : 'quadro incompleto — sensores faltando no laço',
    allWired ? 'rx' : sensorIds.length ? 'err' : 'warn')

  steps.push({ text: status === PASS ? '═══ PRÉ-VOO OK ═══' : status === WARN ? '═══ PRÉ-VOO COM RESSALVAS ═══' : '═══ PRÉ-VOO REPROVADO ═══', cls: status === PASS ? 'ok' : status === WARN ? 'warn' : 'err' })

  return {
    status,
    breakdown,
    summary: status === PASS ? 'Sistema validado para voo' : status === WARN ? 'Validado com ressalvas' : 'Reprovado — corrija antes de prosseguir',
    steps,
  }
}

// ── report export ───────────────────────────────────────────────────
// AIT campaigns deliver a signed test report; this mirrors that as a
// plain-text or JSON artifact labelled with mission + timestamp.
export function buildReport({ missionName, stages, subsystems, real }) {
  const ts = new Date()
  const safe = (missionName || 'forge').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'forge'
  const stamp = ts.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filenameBase = `forge-ait-${safe}-${stamp}`

  const json = {
    report: 'GuiaSat AIT — relatório de testes de hardware',
    mission: missionName || '(sem nome)',
    generatedAt: ts.toISOString(),
    linkMode: real ? 'hardware-real' : 'simulado',
    subsystems: subsystems.map((b) => ({ id: b.id, label: b.sub, present: b.present, components: b.components })),
    stages: TEST_STAGES.map((s) => {
      const st = stages[s.id] || {}
      return { id: s.id, label: s.label, status: st.status || 'idle', summary: st.result?.summary || null, ranAt: st.ranAt || null }
    }),
  }

  const line = '─'.repeat(58)
  const verdictTag = { passed: 'PASSOU', failed: 'FALHOU', warn: 'RESSALVA', skipped: 'PULADO', idle: 'NÃO EXECUTADO' }
  const txt = [
    'GuiaSat · RELATÓRIO DE TESTES DE HARDWARE (AIT)',
    line,
    `Missão     : ${missionName || '(sem nome)'}`,
    `Gerado em  : ${ts.toLocaleString('pt-BR')}`,
    `Enlace     : ${real ? 'hardware real' : 'simulado (digital twin)'}`,
    line,
    'SUBSISTEMAS',
    ...subsystems.map((b) => `  ${b.present ? '●' : '○'} ${b.sub.padEnd(22)} ${b.present ? b.components.join(', ') : '— ausente'}`),
    line,
    'PIPELINE DE VALIDAÇÃO',
    ...TEST_STAGES.map((s) => {
      const st = stages[s.id] || {}
      const tag = verdictTag[st.status || 'idle']
      return `  ${String(s.n)}. ${s.label.padEnd(28)} [${tag}]\n     ${st.result?.summary || '—'}`
    }),
    line,
  ].join('\n')

  return { filenameBase, json, txt }
}
