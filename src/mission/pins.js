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

// Full ESP32-WROOM-32D devkit header, in physical board order with the
// silkscreen labels (mirrors COMPONENT_PINS.esp32 in wiring.js).
export const ESP32_PINS = [
  // lado esquerdo (de cima para baixo)
  { pin: '3V3',           role: 'power', note: 'alimentação 3.3V' },
  { pin: 'GND',           role: 'power', note: 'terra' },
  { pin: 'GPIO15',        role: 'gpio',  note: 'ADC2_CH3 · strapping' },
  { pin: 'GPIO2',         role: 'gpio',  note: 'LED onboard · strapping' },
  { pin: 'GPIO4',         role: 'gpio',  note: 'ADC2_CH0' },
  { pin: 'GPIO16 (RX2)',  role: 'uart',  note: 'RX2 (UART2)' },
  { pin: 'GPIO17 (TX2)',  role: 'uart',  note: 'TX2 (UART2)' },
  { pin: 'GPIO5',         role: 'spi',   note: 'CS (VSPI)' },
  { pin: 'GPIO18',        role: 'spi',   note: 'SCK (VSPI) · I²C remapeável' },
  { pin: 'GPIO19',        role: 'spi',   note: 'MISO (VSPI) · I²C remapeável' },
  { pin: 'GPIO21',        role: 'i2c',   note: 'SDA (barramento I²C)' },
  { pin: 'GPIO3 (RX0)',   role: 'uart',  note: 'RX0 (UART0 · console)' },
  { pin: 'GPIO1 (TX0)',   role: 'uart',  note: 'TX0 (UART0 · console)' },
  { pin: 'GPIO22',        role: 'i2c',   note: 'SCL (barramento I²C)' },
  { pin: 'GPIO23',        role: 'spi',   note: 'MOSI (VSPI) · I²C remapeável' },
  // lado direito (de cima para baixo)
  { pin: 'VIN',           role: 'power', note: 'entrada 5V (USB/externa)' },
  { pin: 'GND',           role: 'power', note: 'terra' },
  { pin: 'GPIO13',        role: 'gpio',  note: 'ADC2_CH4 · touch' },
  { pin: 'GPIO12',        role: 'gpio',  note: 'ADC2_CH5 · strapping' },
  { pin: 'GPIO14',        role: 'gpio',  note: 'ADC2_CH6 · touch' },
  { pin: 'GPIO27',        role: 'gpio',  note: 'ADC2_CH7 · touch' },
  { pin: 'GPIO26',        role: 'gpio',  note: 'ADC2_CH9 · DAC2' },
  { pin: 'GPIO25',        role: 'gpio',  note: 'ADC2_CH8 · DAC1' },
  { pin: 'GPIO33',        role: 'gpio',  note: 'ADC1_CH5 · touch' },
  { pin: 'GPIO32',        role: 'gpio',  note: 'ADC1_CH4 · touch' },
  { pin: 'GPIO35',        role: 'adc',   note: 'ADC1_CH7 (somente entrada)' },
  { pin: 'GPIO34',        role: 'adc',   note: 'ADC1_CH6 (somente entrada)' },
  { pin: 'VN (GPIO39)',   role: 'adc',   note: 'ADC1_CH3 (somente entrada)' },
  { pin: 'VP (GPIO36)',   role: 'adc',   note: 'ADC1_CH0 (somente entrada)' },
  { pin: 'EN',            role: 'ctrl',  note: 'enable/reset do chip' },
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
