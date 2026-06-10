// ──────────────────────────────────────────────────────────────────
// I2C diagnostic engine — cross-references four REAL sources to turn a
// failed sensor probe into a specific, actionable diagnosis instead of
// a generic "ausente":
//   1. the active sketch (#define SDA_PIN / SCL_PIN)
//   2. the ESP32 pin capability database (mission/wiring.js)
//   3. the wiring state the user made on the canvas (store wires)
//   4. the I2C scan result streamed from the physical board
//
// Checks run in strict priority order; each finding carries three
// sentences: what is wrong, why (referencing the value found), and one
// concrete action. "Sensor ausente" is only ever the last resort, when
// pins are valid, wiring matches the code and the scan came back empty
// at the expected address — i.e. the problem is physical.
//
// Pure data + functions — no store/UI imports.
// ──────────────────────────────────────────────────────────────────
import { COMPONENT_PINS, pinDef } from '../mission/wiring.js'

const ESP32_DB = COMPONENT_PINS.esp32

// Known I2C addresses → likely device, for "0x3C (possivelmente OLED)".
const KNOWN_ADDRS = {
  '0x3c': 'OLED SSD1306', '0x3d': 'OLED SSD1306',
  '0x76': 'BMP280', '0x77': 'BMP280',
  '0x68': 'MPU6050', '0x69': 'MPU6050',
}

// A GPIO can carry I2C if it exists on the module, is a data GPIO and is
// not input-only (I2C needs open-drain output — rules out GPIO34..39).
const i2cCapable = (gpioNum) => {
  const p = ESP32_DB.find((p) => p.id === `GPIO${gpioNum}`)
  return !!p && p.role === 'gpio' && !p.inputOnly
}

// Example pins offered in the fix message, validated against the db so
// the suggestion can never drift from the capability database.
const EXAMPLES = { SDA: [21, 18, 23], SCL: [22, 19, 18] }
const examplePins = (signal) =>
  EXAMPLES[signal].filter(i2cCapable).map((n) => `GPIO${n}`).join(', ')

// #define SDA_PIN / SCL_PIN values from the active sketch (null = absent).
export function parseSketchPins(code = '') {
  const grab = (name) => {
    const m = code.match(new RegExp(`#define\\s+${name}\\s+(\\d+)`))
    return m ? parseInt(m[1], 10) : null
  }
  return { sda: grab('SDA_PIN'), scl: grab('SCL_PIN') }
}

// SDA/SCL GPIOs actually wired on the canvas, or null when unwired —
// unlike i2cPinsFromWires this does NOT fall back to defaults, so the
// mismatch check never accuses a canvas the user hasn't wired.
export function canvasI2CPins(wires = []) {
  let sda = null, scl = null
  for (const w of wires) {
    for (const [end, other] of [[w.from, w.to], [w.to, w.from]]) {
      const d = pinDef(end.comp, end.pin)
      const od = pinDef(other.comp, other.pin)
      if (d?.role === 'sda' && od?.role === 'gpio') sda = parseInt(other.pin.replace('GPIO', ''), 10)
      if (d?.role === 'scl' && od?.role === 'gpio') scl = parseInt(other.pin.replace('GPIO', ''), 10)
    }
  }
  return { sda, scl }
}

// Main entry. Returns findings [{ kind, severity, what, why, fix }].
//   sketch  — full source of the active sketch
//   wires   — store wiring state [{from:{comp,pin},to:{comp,pin}}]
//   scan    — { complete: bool, addresses: ['0x3c', ...] } from the board
//   sensors — expected I2C sensors [{ label, addrs: ['0x76','0x77'] }]
export function diagnoseI2C({ sketch = '', wires = [], scan = null, sensors = [{ label: 'BMP280', addrs: ['0x76', '0x77'] }] }) {
  const code = parseSketchPins(sketch)
  const canvas = canvasI2CPins(wires)
  const findings = []

  // 1 · PIN VALIDITY — the #define must point at an I2C-capable GPIO.
  for (const [signal, gpio] of [['SDA', code.sda], ['SCL', code.scl]]) {
    if (gpio == null || i2cCapable(gpio)) continue
    findings.push({
      kind: 'invalid-pin', severity: 'error',
      what: `GPIO${gpio} não suporta I2C no ESP32.`,
      why: `O sketch define ${signal}_PIN como ${gpio}, mas esse GPIO não é capaz de I2C no ESP32-WROOM-32D — o Wire.begin nunca inicializa o barramento.`,
      fix: `Pinos válidos para ${signal}: ${examplePins(signal)} (entre outros). Verifique o #define ${signal}_PIN.`,
    })
  }
  if (findings.length) return findings

  // 2 · WIRING VS CODE — canvas wiring and sketch #defines must agree.
  for (const [signal, wired, defined] of [['SDA', canvas.sda, code.sda], ['SCL', canvas.scl, code.scl]]) {
    if (wired == null || defined == null || wired === defined) continue
    findings.push({
      kind: 'pin-mismatch', severity: 'error',
      what: `Conflito: o canvas tem ${signal} fiado em GPIO${wired} mas o código define ${signal}_PIN como GPIO${defined}.`,
      why: `O Wire.begin usa GPIO${defined}, então o barramento I2C nunca alcança o sensor fiado em GPIO${wired}.`,
      fix: `Corrija o #define ${signal}_PIN para ${wired} ou refaça a fiação para GPIO${defined}.`,
    })
  }
  if (findings.length) return findings

  // 3 & 4 need the real scan result.
  if (!scan?.complete) return findings
  const found = (scan.addresses || []).map((a) => a.toLowerCase())

  for (const s of sensors) {
    if (s.addrs.some((a) => found.includes(a.toLowerCase()))) continue
    const expected = s.addrs.join('/')

    if (found.length > 0) {
      // 3 · ADDRESS MISMATCH — the bus works, but not for this sensor.
      const others = found
        .map((a) => `0x${a.slice(2).toUpperCase()}${KNOWN_ADDRS[a] ? ` (possivelmente ${KNOWN_ADDRS[a]})` : ''}`)
        .join(', ')
      findings.push({
        kind: 'addr-mismatch', severity: 'error',
        what: `${s.label} não respondeu em ${expected}.`,
        why: `A varredura I2C funcionou e encontrou dispositivo em ${others}, mas nada nos endereços esperados do ${s.label}.`,
        fix: `Verifique alimentação e conexão física do ${s.label} — e confira o strap de endereço (pino SDO).`,
      })
    } else {
      // 4 · SENSOR ABSENT — last resort: pins válidos, fiação coerente,
      // barramento vazio. O problema é físico.
      findings.push({
        kind: 'absent', severity: 'error',
        what: `${s.label} ausente.`,
        why: `Os pinos I2C são válidos, a fiação confere com o código e a varredura não encontrou nenhum dispositivo em ${expected}.`,
        fix: `Confira a alimentação (VCC/GND) e as soldas do módulo ${s.label} — a falha está na conexão física.`,
      })
    }
  }
  return findings
}
