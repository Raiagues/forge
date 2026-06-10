// ──────────────────────────────────────────────────────────────────
// Capability model — pure helpers over component definitions.
//
// Every engine reasons about *capabilities* (wifi, i2c, temperature, …)
// rather than hard-coded part numbers. The component catalog is always
// passed in (`defs`) so this layer has no dependency on the store or UI.
// ──────────────────────────────────────────────────────────────────

export const capsOf = (def) => (def && def.caps) || []

// resolve a list of component ids to their definitions (skips unknown)
export const defsForIds = (defs, ids = []) => ids.map((id) => defs[id]).filter(Boolean)

// does ANY component in the list expose this capability?
export const hasCapability = (defList, cap) => defList.some((d) => capsOf(d).includes(cap))

// all catalog components exposing a capability
export const componentsWithCapability = (defs, cap) =>
  Object.values(defs).filter((d) => capsOf(d).includes(cap))

export const byCategory = (defList, cat) => defList.filter((d) => d.category === cat)

export const totalMass = (defList) => defList.reduce((s, d) => s + (d.mass || 0), 0)
export const totalCurrent = (defList) => defList.reduce((s, d) => s + (d.current || 0), 0)

// Human-readable capability labels (for findings / explanations).
export const CAP_LABEL = {
  wifi: 'WiFi', bluetooth: 'Bluetooth', lora: 'LoRa', rf: 'rádio RF',
  i2c: 'I²C', spi: 'SPI', uart: 'UART', adc: 'ADC',
  temperature: 'temperatura', pressure: 'pressão', humidity: 'umidade',
  co2: 'CO₂', tvoc: 'VOCs', 'air-quality': 'qualidade do ar',
  imu: 'IMU', accel: 'aceleração', gyro: 'giroscópio',
  gnss: 'GNSS/GPS', position: 'posição', altitude: 'altitude',
  storage: 'armazenamento', logging: 'log de dados',
  power: 'energia', battery: 'bateria', 'long-range': 'longo alcance',
}
export const capLabel = (cap) => CAP_LABEL[cap] || cap
