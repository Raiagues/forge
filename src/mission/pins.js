// ──────────────────────────────────────────────────────────────────
// Pin model & auto-assignment — ESP32-WROOM-32D (devkit pinout).
//
// Sensors declare a bus need (`def.protocol`); this engine assigns real
// GPIOs automatically following hardware constraints (shared I²C bus,
// dedicated UART/SPI pins, power rails) and reports wiring issues
// (e.g. duplicate I²C addresses) tagged source:'wiring'.
//
// Manual remapping is intentionally NOT implemented yet — the UI shows
// a "custom pin mapping coming soon" notice instead.
// Pure: catalog (`defs`) injected.
// ──────────────────────────────────────────────────────────────────

// Realistic ESP32-WROOM-32D devkit header (subset relevant to FORGE).
export const ESP32_PINS = [
  { pin: '3V3',    role: 'power',  note: 'alimentação 3.3V' },
  { pin: 'GND',    role: 'power',  note: 'terra' },
  { pin: 'GPIO21', role: 'i2c',    note: 'SDA (barramento I²C)' },
  { pin: 'GPIO22', role: 'i2c',    note: 'SCL (barramento I²C)' },
  { pin: 'GPIO16', role: 'uart',   note: 'RX2 (UART2)' },
  { pin: 'GPIO17', role: 'uart',   note: 'TX2 (UART2)' },
  { pin: 'GPIO23', role: 'spi',    note: 'MOSI (VSPI)' },
  { pin: 'GPIO19', role: 'spi',    note: 'MISO (VSPI)' },
  { pin: 'GPIO18', role: 'spi',    note: 'SCK (VSPI)' },
  { pin: 'GPIO5',  role: 'spi',    note: 'CS (VSPI)' },
  { pin: 'GPIO34', role: 'adc',    note: 'ADC1_CH6 (somente entrada)' },
]

// Bus → pin mapping templates. I²C is a shared bus: every I²C device
// gets the same SDA/SCL pins (that is the hardware reality).
const BUS_ASSIGN = {
  I2C: [
    { signal: 'SDA', gpio: 'GPIO21' },
    { signal: 'SCL', gpio: 'GPIO22' },
    { signal: 'VCC', gpio: '3V3' },
    { signal: 'GND', gpio: 'GND' },
  ],
  UART: [
    { signal: 'TX→RX', gpio: 'GPIO16' },
    { signal: 'RX→TX', gpio: 'GPIO17' },
    { signal: 'VCC', gpio: '3V3' },
    { signal: 'GND', gpio: 'GND' },
  ],
  SPI: [
    { signal: 'MOSI', gpio: 'GPIO23' },
    { signal: 'MISO', gpio: 'GPIO19' },
    { signal: 'SCK', gpio: 'GPIO18' },
    { signal: 'CS', gpio: 'GPIO5' },
    { signal: 'GND', gpio: 'GND' },
  ],
}

// Assign pins for the current component set.
// Returns { assignments: {compId: [{signal,gpio}]}, issues: [...] }
export function assignPins(defs, componentIds = []) {
  const assignments = {}
  const issues = []
  const i2cAddresses = {}
  const uartUsers = []
  const hasMcu = componentIds.some((id) => defs[id]?.category === 'mcu')

  for (const id of componentIds) {
    const def = defs[id]
    if (!def || def.category === 'mcu') continue
    const bus = def.protocol
    if (!bus || !BUS_ASSIGN[bus]) {
      if (def.category === 'power') assignments[id] = [{ signal: '+', gpio: 'VIN' }, { signal: '−', gpio: 'GND' }]
      continue
    }
    assignments[id] = BUS_ASSIGN[bus]

    if (bus === 'I2C' && def.address) {
      if (i2cAddresses[def.address]) {
        issues.push({
          severity: 'error', source: 'wiring',
          title: `Conflito de endereço I²C ${def.address}`,
          detail: `${defs[i2cAddresses[def.address]].label} e ${def.label} usam o mesmo endereço ${def.address} no barramento I²C.`,
          targets: [id, i2cAddresses[def.address]],
        })
      } else {
        i2cAddresses[def.address] = id
      }
    }
    if (bus === 'UART') {
      uartUsers.push(id)
      if (uartUsers.length > 1) {
        issues.push({
          severity: 'error', source: 'wiring',
          title: 'UART2 já ocupada',
          detail: `Apenas um periférico pode usar a UART2 (GPIO16/17). Em conflito: ${uartUsers.map((u) => defs[u].label).join(', ')}.`,
          targets: [...uartUsers],
        })
      }
    }
  }

  if (componentIds.length > 0 && !hasMcu) {
    const peripherals = componentIds.filter((id) => defs[id] && defs[id].category !== 'mcu' && defs[id].category !== 'power')
    if (peripherals.length) {
      issues.push({
        severity: 'error', source: 'wiring',
        title: 'Sensores sem computador de bordo',
        detail: 'Os sensores precisam de um microcontrolador para se conectar. Adicione o computador de bordo (ESP32).',
        targets: peripherals,
      })
    }
  }

  return { assignments, issues }
}

// Pretty string for a component's assignment, e.g. "SDA→GPIO21 · SCL→GPIO22"
export function pinSummary(assignment = []) {
  return assignment
    .filter((a) => a.gpio.startsWith('GPIO'))
    .map((a) => `${a.signal}→${a.gpio.replace('GPIO', '')}`)
    .join(' · ')
}
