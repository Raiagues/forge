// ──────────────────────────────────────────────────────────────────
// Manual wiring — prototyping-style pin connections with real-time
// rule validation (ESP32 / BMP280 / MPU6050 for now).
//
// A wire is { from: {comp, pin}, to: {comp, pin} }. The engine knows
// each component's physical pins and their electrical roles, validates
// every connection (shorts, power on data pins, crossed I²C, missing
// power, double-used pins) and derives an honest per-component
// connection status: a sensor is only "wired" when its power AND data
// pins are correctly connected. The generated firmware uses the GPIOs
// the user actually wired.
//
// Pure data + functions — no store/UI imports.
// ──────────────────────────────────────────────────────────────────

// Pin roles: power3v3 | gnd | vcc | gpio (with optional i2c hint)
export const COMPONENT_PINS = {
  esp32: [
    { id: '3V3',    role: 'power3v3', note: 'alimentação 3.3V' },
    { id: 'GND',    role: 'gnd',      note: 'terra' },
    { id: 'GPIO21', role: 'gpio', i2c: 'sda', note: 'SDA padrão (I²C)' },
    { id: 'GPIO22', role: 'gpio', i2c: 'scl', note: 'SCL padrão (I²C)' },
    { id: 'GPIO16', role: 'gpio', note: 'RX2 (UART2)' },
    { id: 'GPIO17', role: 'gpio', note: 'TX2 (UART2)' },
    { id: 'GPIO18', role: 'gpio', note: 'SCK (VSPI)' },
    { id: 'GPIO19', role: 'gpio', note: 'MISO (VSPI)' },
    { id: 'GPIO23', role: 'gpio', note: 'MOSI (VSPI)' },
    { id: 'GPIO34', role: 'gpio', inputOnly: true, note: 'ADC1_CH6 · somente entrada' },
  ],
  bmp280: [
    { id: 'VCC', role: 'vcc', note: 'alimentação (3.3V)' },
    { id: 'GND', role: 'gnd', note: 'terra' },
    { id: 'SCL', role: 'scl', note: 'clock I²C' },
    { id: 'SDA', role: 'sda', note: 'dados I²C' },
  ],
  mpu6050: [
    { id: 'VCC', role: 'vcc', note: 'alimentação (3.3V)' },
    { id: 'GND', role: 'gnd', note: 'terra' },
    { id: 'SCL', role: 'scl', note: 'clock I²C' },
    { id: 'SDA', role: 'sda', note: 'dados I²C' },
  ],
}

export const pinDef = (comp, pin) => (COMPONENT_PINS[comp] || []).find(p => p.id === pin) || null
const endKey = (e) => `${e.comp}.${e.pin}`
export const sameEnd = (a, b) => a.comp === b.comp && a.pin === b.pin

// Standard wiring suggestion per sensor (used by "auto-connect").
export function autoWiresFor(compId) {
  if (!COMPONENT_PINS[compId] || compId === 'esp32') return []
  return [
    { from: { comp: compId, pin: 'VCC' }, to: { comp: 'esp32', pin: '3V3' } },
    { from: { comp: compId, pin: 'GND' }, to: { comp: 'esp32', pin: 'GND' } },
    { from: { comp: compId, pin: 'SDA' }, to: { comp: 'esp32', pin: 'GPIO21' } },
    { from: { comp: compId, pin: 'SCL' }, to: { comp: 'esp32', pin: 'GPIO22' } },
  ]
}

// Classify a wire for coloring: power | gnd | i2c | other
export function wireNet(w) {
  const roles = [pinDef(w.from.comp, w.from.pin)?.role, pinDef(w.to.comp, w.to.pin)?.role]
  if (roles.includes('power3v3') || roles.includes('vcc')) return 'power'
  if (roles.every(r => r === 'gnd')) return 'gnd'
  if (roles.includes('sda') || roles.includes('scl')) return 'i2c'
  return 'other'
}

// ── validation ─────────────────────────────────────────────────────
// Returns issues: { severity, source:'wiring', title, detail, targets, wireIndex? }
export function validateWires({ defs, wires = [], componentIds = [] }) {
  const issues = []
  const push = (i) => issues.push({ source: 'wiring', suggestions: [], ...i })

  // per-wire electrical rules
  wires.forEach((w, idx) => {
    const a = pinDef(w.from.comp, w.from.pin)
    const b = pinDef(w.to.comp, w.to.pin)
    if (!a || !b) return
    const roles = [a.role, b.role].sort().join('+')

    if (w.from.comp === w.to.comp) {
      push({
        severity: 'error', wireIndex: idx, targets: [w.from.comp],
        title: 'Conexão no mesmo componente',
        detail: `${w.from.pin} → ${w.to.pin} liga o ${w.from.comp} a ele mesmo. Conecte o pino ao ESP32.`,
      })
      return
    }
    // short circuit: 3V3/VCC tied to GND
    if ((roles === 'gnd+power3v3') || (roles === 'gnd+vcc')) {
      push({
        severity: 'error', wireIndex: idx, targets: [w.from.comp, w.to.comp],
        title: 'Curto-circuito: alimentação → GND',
        detail: `${w.from.pin} (${w.from.comp}) ligado a ${w.to.pin} (${w.to.comp}) cria um curto entre 3.3V e terra. Isso danificaria o hardware real.`,
      })
      return
    }
    // power pin into a data GPIO
    if ((a.role === 'vcc' && b.role === 'gpio') || (b.role === 'vcc' && a.role === 'gpio')) {
      push({
        severity: 'error', wireIndex: idx, targets: [w.from.comp, w.to.comp],
        title: 'Alimentação em pino de dados',
        detail: 'VCC deve ir ao pino 3V3 do ESP32, não a um GPIO. Um GPIO não fornece corrente suficiente e pode ser danificado.',
      })
      return
    }
    // GND must go to GND
    if ((a.role === 'gnd') !== (b.role === 'gnd')) {
      push({
        severity: 'error', wireIndex: idx, targets: [w.from.comp, w.to.comp],
        title: 'GND mal conectado',
        detail: 'O pino GND do sensor precisa ir ao GND do ESP32 para fechar o circuito de referência.',
      })
      return
    }
    // I²C data pins must land on a GPIO
    const i2cEnd = a.role === 'sda' || a.role === 'scl' ? a : (b.role === 'sda' || b.role === 'scl' ? b : null)
    if (i2cEnd) {
      const other = i2cEnd === a ? b : a
      if (other.role !== 'gpio') {
        push({
          severity: 'error', wireIndex: idx, targets: [w.from.comp, w.to.comp],
          title: `${i2cEnd.id} fora de um GPIO`,
          detail: `${i2cEnd.id} é um sinal I²C e precisa ir a um GPIO do ESP32 (padrão: SDA→GPIO21, SCL→GPIO22).`,
        })
      } else if (other.i2c && other.i2c !== i2cEnd.role) {
        push({
          severity: 'error', wireIndex: idx, targets: [w.from.comp, w.to.comp],
          title: 'SDA/SCL invertidos',
          detail: `${i2cEnd.id} foi ligado a ${other.id}, que é o pino ${other.i2c.toUpperCase()} padrão. Troque: SDA→GPIO21, SCL→GPIO22.`,
        })
      } else if (!other.i2c) {
        push({
          severity: 'warn', wireIndex: idx, targets: [w.from.comp],
          title: `I²C remapeado para ${other.id}`,
          detail: `Funciona — o ESP32 permite remapear o barramento — mas o padrão é GPIO21/22. O código gerado usará ${other.id}.`,
        })
      }
    }
  })

  // sensor-side pins used more than once (ESP32 power/bus pins may fan out)
  const used = {}
  wires.forEach((w, idx) => {
    for (const end of [w.from, w.to]) {
      if (end.comp === 'esp32') continue
      const k = endKey(end)
      if (used[k] != null) {
        push({
          severity: 'error', wireIndex: idx, targets: [end.comp],
          title: `Pino ${end.pin} usado duas vezes`,
          detail: `O pino ${end.pin} do ${end.comp} já está conectado. Remova um dos fios.`,
        })
      } else used[k] = idx
    }
  })

  // sensors present but no onboard computer to connect them to
  const hasMcu = componentIds.some((id) => defs?.[id]?.category === 'mcu' || id === 'esp32')
  const peripherals = componentIds.filter((id) => id !== 'esp32' && COMPONENT_PINS[id])
  if (!hasMcu && peripherals.length > 0) {
    push({
      severity: 'error', targets: [...peripherals],
      title: 'Sensores sem computador de bordo',
      detail: 'Os sensores precisam de um microcontrolador para se conectar. Adicione o computador de bordo (ESP32).',
    })
  }

  // unwired sensors — honest "not connected" state, never fake-positive
  for (const id of componentIds) {
    if (id === 'esp32' || !COMPONENT_PINS[id]) continue
    const st = wiringStatus(id, wires)
    if (!st.wired) {
      const missing = []
      if (!st.powered) missing.push('alimentação (VCC→3V3, GND→GND)')
      if (!st.data) missing.push('barramento I²C (SDA→GPIO21, SCL→GPIO22)')
      push({
        severity: 'warn', targets: [id],
        title: `${defs?.[id]?.label || id} sem fiação`,
        detail: `Sensor presente na placa mas não conectado: falta ${missing.join(' e ')}. Conecte os pinos na vista 2D ou use auto-conectar.`,
      })
    }
  }

  return issues
}

// Honest per-component connection status derived from actual wires.
export function wiringStatus(compId, wires = []) {
  if (compId === 'esp32') return { powered: true, data: true, wired: true }
  if (!COMPONENT_PINS[compId]) return { powered: false, data: false, wired: false }

  const find = (pin) => wires.find(w =>
    (w.from.comp === compId && w.from.pin === pin) || (w.to.comp === compId && w.to.pin === pin))
  const otherEnd = (w, pin) => (w.from.comp === compId && w.from.pin === pin) ? w.to : w.from

  const ok = (pin, pred) => {
    const w = find(pin)
    if (!w) return false
    const o = otherEnd(w, pin)
    const od = pinDef(o.comp, o.pin)
    return !!od && pred(od)
  }

  const powered = ok('VCC', d => d.role === 'power3v3') && ok('GND', d => d.role === 'gnd')
  const data = ok('SDA', d => d.role === 'gpio' && (!d.i2c || d.i2c === 'sda'))
            && ok('SCL', d => d.role === 'gpio' && (!d.i2c || d.i2c === 'scl'))
  return { powered, data, wired: powered && data }
}

export function wiringStatusAll(componentIds, wires) {
  const out = {}
  for (const id of componentIds) out[id] = wiringStatus(id, wires)
  return out
}

// I²C GPIOs the user actually wired (for the code generator).
// Falls back to the ESP32 defaults when nothing is wired yet.
export function i2cPinsFromWires(wires = []) {
  let sda = 21, scl = 22
  for (const w of wires) {
    for (const [end, other] of [[w.from, w.to], [w.to, w.from]]) {
      const d = pinDef(end.comp, end.pin)
      const od = pinDef(other.comp, other.pin)
      if (d?.role === 'sda' && od?.role === 'gpio') sda = parseInt(other.pin.replace('GPIO', ''), 10) || sda
      if (d?.role === 'scl' && od?.role === 'gpio') scl = parseInt(other.pin.replace('GPIO', ''), 10) || scl
    }
  }
  return { sda, scl }
}
