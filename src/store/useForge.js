import { create } from 'zustand'
import {
  getFramework, validateDesign, runCopilot, generateArchitecture,
} from '../mission/index.js'

// ──────────────────────────────────────────────────────────────────
// FORGE store — single source of truth for the digital twin.
//
// Everything the UI shows is derived from this store. Mission
// templates are *generators*: loadTemplate() builds entities,
// connections, telemetry history and the serial log so that the
// 3D scene, the drawers, the nav lists and every panel stay in sync.
// ──────────────────────────────────────────────────────────────────

export const STATUS = { IDLE: 'idle', OK: 'ok', WARN: 'warn', ERR: 'err', SCANNING: 'scanning' }

// I2C/SPI/UART pin map used both for the architecture view and the
// connection metadata stored on each entity.
const BUS_PINS = {
  I2C:  ['SDA → GPIO21', 'SCL → GPIO22'],
  SPI:  ['MOSI → GPIO23', 'MISO → GPIO19', 'SCK → GPIO18', 'CS → GPIO5'],
  UART: ['TX → GPIO16', 'RX → GPIO17'],
}

export const COMPONENT_DEFS = {
  esp32:      { id: 'esp32',      label: 'ESP32-WROOM-32', category: 'mcu',     protocol: 'MCU',  voltage: '3.3V', mass: 8,  current: 240, color: '#2B3F7A', caps: ['mcu','wifi','bluetooth','i2c','spi','uart','adc'] },
  esp8266:    { id: 'esp8266',    label: 'ESP8266',        category: 'mcu',     protocol: 'MCU',  voltage: '3.3V', mass: 7,  current: 170, color: '#2B3F7A', caps: ['mcu','wifi','i2c','spi','uart','adc'] },
  rp2040:     { id: 'rp2040',     label: 'RP2040 (Pico)',  category: 'mcu',     protocol: 'MCU',  voltage: '3.3V', mass: 6,  current: 90,  color: '#3A2B4A', caps: ['mcu','i2c','spi','uart','adc'] },
  bme280:     { id: 'bme280',     label: 'BME280',         category: 'sensor',  protocol: 'I2C',  address: '0x76', voltage: '3.3V', mass: 2, current: 3,   color: '#1E3A28', measures: ['temperature','pressure','humidity'], caps: ['i2c','temperature','pressure','humidity'] },
  mpu6050:    { id: 'mpu6050',    label: 'MPU6050',        category: 'sensor',  protocol: 'I2C',  address: '0x68', voltage: '3.3V', mass: 3, current: 3.9, color: '#2A2014', measures: ['accelerometer','gyroscope'], caps: ['i2c','imu','accel','gyro'] },
  gps_neo6m:  { id: 'gps_neo6m',  label: 'GPS NEO-6M',     category: 'sensor',  protocol: 'UART', voltage: '3.3V', mass: 5,  current: 50,  color: '#2A1414', measures: ['position','altitude'], caps: ['uart','gnss','position','altitude'] },
  ccs811:     { id: 'ccs811',     label: 'CCS811',         category: 'sensor',  protocol: 'I2C',  address: '0x5A', voltage: '3.3V', mass: 2, current: 30,  color: '#1A2A1A', measures: ['co2','tvoc'], caps: ['i2c','co2','tvoc','air-quality'] },
  lora_sx1276:{ id: 'lora_sx1276',label: 'LoRa SX1276',    category: 'comm',    protocol: 'SPI',  voltage: '3.3V', mass: 4,  current: 120, color: '#2A1E3A', measures: ['rssi','snr'], caps: ['spi','lora','rf','long-range'] },
  sd_card:    { id: 'sd_card',    label: 'MicroSD',        category: 'storage', protocol: 'SPI',  voltage: '3.3V', mass: 1,  current: 100, color: '#1E2814', caps: ['spi','storage','logging'] },
  lipo_2000:  { id: 'lipo_2000',  label: 'LiPo 2000mAh',   category: 'power',   protocol: null,   voltage: '3.7V', mass: 40, capacity: 2000, color: '#2A1E0A', caps: ['power','battery'] },
}

export const MISSION_TEMPLATES = [
  {
    id: 'atmospheric',
    label: 'Monitoramento atmosférico',
    icon: '🌬️',
    description: 'CO₂, temperatura, pressão e umidade em altitude estratosférica.',
    altitude: '30 km',
    components: ['esp32','bme280','ccs811','mpu6050','lora_sx1276','sd_card','lipo_2000'],
    objectives: [
      'Registrar perfil vertical de CO₂ até 30 km',
      'Medir temperatura, pressão e umidade a 1 Hz',
      'Transmitir telemetria via LoRa durante todo o voo',
      'Gravar dados brutos em cartão SD como backup',
    ],
    constraints: 'Massa < 250 g · Consumo médio < 400 mA · Autonomia ≥ 3 h',
  },
  {
    id: 'positioning',
    label: 'Rastreamento GPS',
    icon: '📡',
    description: 'GPS em tempo real com telemetria LoRa e log de trajetória.',
    altitude: '25 km',
    components: ['esp32','gps_neo6m','mpu6050','lora_sx1276','sd_card','lipo_2000'],
    objectives: [
      'Obter fixo GPS e registrar trajetória completa',
      'Estimar atitude com IMU de 6 eixos',
      'Transmitir posição via LoRa a cada 5 s',
      'Permitir recuperação por última posição conhecida',
    ],
    constraints: 'Massa < 220 g · Atualização GPS ≥ 1 Hz · Link LoRa ≥ 10 km',
  },
  {
    id: 'environmental',
    label: 'Qualidade do ar',
    icon: '🌿',
    description: 'CO₂, VOCs e dados meteorológicos básicos.',
    altitude: '12 km',
    components: ['esp32','bme280','ccs811','lora_sx1276','sd_card','lipo_2000'],
    objectives: [
      'Mapear concentração de VOCs por altitude',
      'Correlacionar CO₂ com temperatura e umidade',
      'Transmitir índice de qualidade do ar via LoRa',
    ],
    constraints: 'Massa < 230 g · Sensor CCS811 aquecido ≥ 20 min antes do voo',
  },
]

export const SECTIONS = [
  { id: 'mission',      label: 'Mission',      icon: 'target'   },
  { id: 'architecture', label: 'Architecture', icon: 'grid'     },
  { id: 'hardware',     label: 'Hardware',     icon: 'cpu'      },
  { id: 'firmware',     label: 'Firmware',     icon: 'code'     },
  { id: 'debug',        label: 'Debug',        icon: 'bug'      },
  { id: 'serial',       label: 'Serial',       icon: 'terminal' },
  { id: 'telemetry',    label: 'Telemetry',    icon: 'activity' },
  { id: 'serialtest',   label: 'Serial Test',  icon: 'lab'      },
]

// ── helpers ───────────────────────────────────────────────────────
const rnd  = (a, b) => a + Math.random() * (b - a)
const f    = (v, d = 1) => Number(v).toFixed(d)
const clock = (offsetSec = 0) => {
  const d = new Date(Date.now() - offsetSec * 1000)
  return d.toTimeString().slice(0, 8)
}

// Default status per component so a freshly loaded mission already has
// a realistic mix of healthy / warning / failed parts to inspect.
function defaultStatus(id) {
  if (id === 'gps_neo6m') return STATUS.ERR
  if (id === 'mpu6050')   return STATUS.WARN
  return STATUS.OK
}

// Live readings generator. `seq` is a monotonic tick counter so values
// like uptime / packet counts advance instead of jittering randomly.
function genReadings(id, status, seq = 0) {
  switch (id) {
    case 'bme280':
      return { temperature: `${f(rnd(20, 26))} °C`, pressure: `${f(rnd(675, 690), 0)} hPa`, humidity: `${f(rnd(33, 47))} %` }
    case 'mpu6050':
      return { accel_x: f(rnd(-0.03, 0.03), 3), accel_y: f(rnd(-0.03, 0.03), 3), accel_z: f(rnd(0.97, 1.02), 3), gyro_x: `${f(rnd(-0.4, 0.4), 2)} °/s`, temp: `${f(rnd(28, 34))} °C` }
    case 'ccs811':
      return { co2: `${f(rnd(410, 620), 0)} ppm`, tvoc: `${f(rnd(8, 45), 0)} ppb` }
    case 'gps_neo6m': {
      // ERR = no fix yet: searching, low satellites, coordinates dashed.
      const sats = Math.max(0, Math.round(rnd(0, 3)))
      return {
        fix: 'no fix · searching',
        satellites: `${sats} / 4 min`,
        latitude: '—',
        longitude: '—',
        altitude: '—',
        signal: `${f(rnd(8, 18), 0)} dBHz`,
        uart: '9600 8N1 · 0 NMEA',
      }
    }
    case 'lora_sx1276':
      return { rssi: `${f(rnd(-108, -72), 0)} dBm`, snr: `${f(rnd(6, 11))} dB`, frequency: '915.0 MHz', sf: 'SF9 / BW125', tx_count: `${seq * 1} pkt`, last_ack: 'OK' }
    case 'sd_card':
      return { capacity: '8 GB', free: `${f(rnd(7.3, 7.6))} GB`, files: `${4 + seq} logs`, write: `${f(rnd(2, 6))} kB/s` }
    case 'lipo_2000': {
      const pct = Math.max(40, 96 - seq * 0.3)
      return { voltage: `${f(rnd(3.86, 4.05), 2)} V`, charge: `${f(pct, 0)} %`, draw: `${f(rnd(280, 380), 0)} mA`, temp: `${f(rnd(24, 31))} °C` }
    }
    case 'esp32':
      return { free_heap: `${f(rnd(208, 232), 0)} kB`, cpu: '240 MHz', cpu_temp: `${f(rnd(41, 49))} °C`, uptime: `${seq * 3} s` }
    default:
      return {}
  }
}

function genLogs(id) {
  if (id === 'gps_neo6m') return [
    { t: clock(2),  m: 'UART timeout 500ms · retry 3/3', cls: 'err' },
    { t: clock(4),  m: 'no NMEA sentence received', cls: 'err' },
    { t: clock(6),  m: 'UART init GPIO16/17 · 9600 baud', cls: 'info' },
  ]
  if (id === 'mpu6050') return [
    { t: clock(3),  m: 'accel noise above threshold (σ=0.018)', cls: 'warn' },
    { t: clock(5),  m: 'WHO_AM_I = 0x68 OK', cls: 'ok' },
    { t: clock(6),  m: 'I2C 0x68 ACK', cls: 'ok' },
  ]
  if (id === 'bme280') return [
    { t: clock(2),  m: 'T=24.1 P=682 H=37.8', cls: 'ok' },
    { t: clock(5),  m: '0x76 ACK · chip id 0x60 OK', cls: 'ok' },
  ]
  if (id === 'ccs811') return [
    { t: clock(4),  m: 'app start · drive mode 1', cls: 'ok' },
    { t: clock(8),  m: 'warming up sensor (20 min)', cls: 'warn' },
  ]
  if (id === 'lora_sx1276') return [
    { t: clock(2),  m: 'TX packet #seq · ACK', cls: 'ok' },
    { t: clock(6),  m: 'SX1276 v1.2 detected on SPI', cls: 'ok' },
  ]
  if (id === 'lipo_2000') return [
    { t: clock(7),  m: 'pack 4.01V · 92% · nominal', cls: 'ok' },
  ]
  if (id === 'sd_card') return [
    { t: clock(5),  m: 'mounted FAT32 · log_0007.csv', cls: 'ok' },
  ]
  if (id === 'esp32') return [
    { t: clock(5),  m: 'boot OK · IDF v5.1', cls: 'ok' },
    { t: clock(4),  m: 'I2C init SDA=21 SCL=22', cls: 'info' },
    { t: clock(3),  m: 'SPI init · LoRa + SD', cls: 'info' },
  ]
  return [{ t: clock(1), m: 'init OK', cls: 'ok' }]
}

// Connection metadata: every non-MCU part links back to the ESP32 over
// its bus. Stored on the entity so the Architecture panel and the 3D
// wires read from the same source.
function genConnections(id) {
  const def = COMPONENT_DEFS[id]
  if (!def || !def.protocol || def.protocol === 'MCU') {
    if (id === 'lipo_2000') return [{ to: 'esp32', bus: 'PWR', pins: ['+ → VIN', '− → GND'] }]
    return []
  }
  return [{ to: 'esp32', bus: def.protocol, pins: BUS_PINS[def.protocol] || [] }]
}

function makeEntity(compId, position, seq = 0) {
  const def = COMPONENT_DEFS[compId]
  const status = defaultStatus(compId)
  return {
    id: compId,
    type: compId,
    def,
    protocol: def.protocol,
    position,
    rotation: [0, 0, 0],
    status,
    readings: genReadings(compId, status, seq),
    connections: genConnections(compId),
    logs: genLogs(compId),
  }
}

// Stable grid layout: the MCU hub is centred, peripherals around it.
function layoutFor(components) {
  const cols = 3
  const pos = {}
  const hub = components.find((id) => COMPONENT_DEFS[id]?.category === 'mcu')
  let i = 0
  components.forEach((id) => {
    if (id === hub) { pos[id] = [0, 0, 0]; return }
    const col = i % cols, row = Math.floor(i / cols)
    pos[id] = [col * 2.6 - 2.6, 0, row * 2.0 - 2.0]
    i++
  })
  return pos
}

const INITIAL_SERIAL = [
  { t: clock(2), m: 'GPS UART timeout 500ms', cls: 'err' },
  { t: clock(4), m: 'I2C 0x76 BME280 OK', cls: 'ok' },
  { t: clock(5), m: 'I2C 0x68 MPU6050 ACK', cls: 'ok' },
  { t: clock(7), m: 'ESP32 boot OK · IDF v5.1', cls: 'ok' },
]

// Persisted nav width (engineering-workstation feel survives reloads).
const NAV_KEY = 'forge.navWidth'
function loadNavWidth() {
  try {
    const v = parseInt(localStorage.getItem(NAV_KEY), 10)
    if (Number.isFinite(v)) return Math.min(360, Math.max(170, v))
  } catch { /* SSR / no storage */ }
  return 210
}

const useForge = create((set, get) => ({
  project: { name: 'PISCE', competition: 'OBSAT · Fase 2', daysLeft: 26 },
  mission: { id: null, label: '', description: '', objectives: [], constraints: '', altitude: '—' },
  entities: {},
  activeSection: 'mission',
  selectedId: null,
  drawerOpen: false,
  isScanning: false,
  connectionStatus: 'connected',
  navWidth: loadNavWidth(),
  seq: 0,
  telemetry: [],            // rolling time-series for the Telemetry charts
  serialLog: INITIAL_SERIAL,

  // ── mission planning layer (drives the whole platform) ──────────
  missionPlan: {
    frameworkId: null,
    name: '',
    objectives: [],
    environment: { platform: '', altitude: '', tempRange: '', notes: '' },
    components: [],          // planned component ids (pre-architecture)
    software: [],            // chosen software module ids
    custom: { description: '' },
  },
  workflowStep: 'framework',
  validation: null,          // last validation result (validation engine)
  copilot: { open: false, running: false, result: null, mode: null },

  // ── navigation / selection ──────────────────────────────────────
  setSection: (id) => set({ activeSection: id }),
  selectEntity: (id) => set({ selectedId: id, drawerOpen: !!id }),
  closeDrawer: () => set({ drawerOpen: false, selectedId: null }),

  setNavWidth: (w) => {
    const clamped = Math.min(360, Math.max(170, Math.round(w)))
    try { localStorage.setItem(NAV_KEY, String(clamped)) } catch { /* ignore */ }
    set({ navWidth: clamped })
  },

  // ── mission template = full state generator ─────────────────────
  loadTemplate: (templateId) => {
    const tmpl = MISSION_TEMPLATES.find(t => t.id === templateId)
    if (!tmpl) return
    const pos = layoutFor(tmpl.components)
    const entities = {}
    tmpl.components.forEach((compId) => { entities[compId] = makeEntity(compId, pos[compId], 0) })

    set({
      mission: {
        id: templateId,
        label: tmpl.label,
        description: tmpl.description,
        objectives: tmpl.objectives,
        constraints: tmpl.constraints,
        altitude: tmpl.altitude,
      },
      entities,
      selectedId: null,
      drawerOpen: false,
      activeSection: 'hardware',
      seq: 0,
      telemetry: [],
      serialLog: [
        { t: clock(0), m: `mission '${tmpl.label}' loaded · ${tmpl.components.length} parts`, cls: 'info' },
        ...INITIAL_SERIAL,
      ],
    })
  },

  clearMission: () => set({
    mission: { id: null, label: '', description: '', objectives: [], constraints: '', altitude: '—' },
    entities: {}, selectedId: null, drawerOpen: false, telemetry: [], activeSection: 'mission',
  }),

  // ── hardware editing ────────────────────────────────────────────
  addEntity: (compId) => {
    if (get().entities[compId]) return
    const n = Object.keys(get().entities).length
    const pos = [(n % 3) * 2.6 - 2.6, 0, Math.floor(n / 3) * 2.0 - 2.0]
    set(s => ({ entities: { ...s.entities, [compId]: makeEntity(compId, pos, s.seq) } }))
  },
  removeEntity: (compId) => set(s => {
    const e = { ...s.entities }; delete e[compId]
    const sel = s.selectedId === compId ? null : s.selectedId
    return { entities: e, selectedId: sel, drawerOpen: sel ? s.drawerOpen : false }
  }),

  updatePosition: (id, pos) => set(s => s.entities[id] ? ({ entities: { ...s.entities, [id]: { ...s.entities[id], position: pos } } }) : s),
  updateRotation: (id, rot) => set(s => s.entities[id] ? ({ entities: { ...s.entities, [id]: { ...s.entities[id], rotation: rot } } }) : s),
  updateStatus:   (id, status) => set(s => s.entities[id] ? ({ entities: { ...s.entities, [id]: { ...s.entities[id], status } } }) : s),

  // ── I2C/SPI scan simulation ─────────────────────────────────────
  runScan: () => {
    const { entities } = get()
    if (get().isScanning || Object.keys(entities).length === 0) return
    set({ isScanning: true })
    get().pushSerial({ m: 'I2C/SPI scan 0x08–0x77 started', cls: 'info' })
    Object.keys(entities).forEach(id => {
      if (['I2C', 'SPI'].includes(entities[id].def.protocol)) get().updateStatus(id, STATUS.SCANNING)
    })
    setTimeout(() => {
      Object.keys(get().entities).forEach(id => {
        const e = get().entities[id]
        if (e.status === STATUS.SCANNING) {
          const final = defaultStatus(id)
          get().updateStatus(id, final)
          const def = e.def
          get().pushSerial({
            m: `${def.protocol} ${def.address || ''} ${def.label} ${final === STATUS.OK ? 'OK' : final.toUpperCase()}`.replace(/\s+/g, ' ').trim(),
            cls: final === STATUS.OK ? 'ok' : final === STATUS.WARN ? 'warn' : 'err',
          })
        }
      })
      get().pushSerial({ m: 'scan complete', cls: 'info' })
      set({ isScanning: false })
    }, 2200)
  },

  // ── live tick: readings + telemetry history + serial heartbeat ──
  simulateTick: () => {
    const { entities, seq } = get()
    if (Object.keys(entities).length === 0) return
    const nextSeq = seq + 1
    const next = {}
    Object.keys(entities).forEach(id => {
      const e = entities[id]
      // refresh readings for everything except parts mid-scan
      next[id] = e.status === STATUS.SCANNING ? e : { ...e, readings: genReadings(id, e.status, nextSeq) }
    })

    // telemetry sample (only fields that exist in the current mission)
    const num = (v) => parseFloat(String(v)) || 0
    const sample = {
      t: nextSeq,
      temp: next.bme280 ? num(next.bme280.readings.temperature) : null,
      co2:  next.ccs811 ? num(next.ccs811.readings.co2) : null,
      batt: next.lipo_2000 ? num(next.lipo_2000.readings.charge) : null,
      rssi: next.lora_sx1276 ? num(next.lora_sx1276.readings.rssi) : null,
    }
    const telemetry = [...get().telemetry, sample].slice(-48)

    set({ entities: next, seq: nextSeq, telemetry })
  },

  pushSerial: (entry) => set(s => ({
    serialLog: [{ t: clock(0), ...entry }, ...s.serialLog].slice(0, 200),
  })),
  clearSerial: () => set({ serialLog: [] }),

  setMissionField: (field, value) => set(s => ({ mission: { ...s.mission, [field]: value } })),

  // ────────────────────────────────────────────────────────────────
  // Mission planning workflow — thin actions that delegate all logic
  // to the engines in src/mission/*. The catalog is injected so the
  // engines stay decoupled from the store.
  // ────────────────────────────────────────────────────────────────
  selectFramework: (id) => {
    const fw = getFramework(id)
    if (!fw) return
    set({
      missionPlan: {
        frameworkId: id,
        name: fw.name,
        objectives: [],
        environment: { ...fw.environment },
        components: [...(fw.starter || [])],
        software: [],
        custom: { description: '' },
      },
      workflowStep: 'framework',
      validation: null,
      copilot: { open: false, running: false, result: null, mode: null },
    })
  },

  exitFramework: () => set({
    missionPlan: {
      frameworkId: null, name: '', objectives: [],
      environment: { platform: '', altitude: '', tempRange: '', notes: '' },
      components: [], software: [], custom: { description: '' },
    },
    workflowStep: 'framework', validation: null,
    copilot: { open: false, running: false, result: null, mode: null },
  }),

  setWorkflowStep: (id) => set({ workflowStep: id }),

  addObjective: (text) => set(s => text.trim()
    ? { missionPlan: { ...s.missionPlan, objectives: [...s.missionPlan.objectives, text.trim()] } } : s),
  updateObjective: (i, text) => set(s => {
    const objectives = s.missionPlan.objectives.slice(); objectives[i] = text
    return { missionPlan: { ...s.missionPlan, objectives } }
  }),
  removeObjective: (i) => set(s => ({
    missionPlan: { ...s.missionPlan, objectives: s.missionPlan.objectives.filter((_, j) => j !== i) },
  })),

  setEnvField: (k, v) => set(s => ({
    missionPlan: { ...s.missionPlan, environment: { ...s.missionPlan.environment, [k]: v } },
  })),
  setCustomDescription: (text) => set(s => ({
    missionPlan: { ...s.missionPlan, custom: { ...s.missionPlan.custom, description: text } },
  })),

  togglePlanComponent: (id) => set(s => {
    const has = s.missionPlan.components.includes(id)
    const components = has
      ? s.missionPlan.components.filter(c => c !== id)
      : [...s.missionPlan.components, id]
    return { missionPlan: { ...s.missionPlan, components }, validation: null }
  }),
  togglePlanSoftware: (id) => set(s => {
    const has = s.missionPlan.software.includes(id)
    const software = has
      ? s.missionPlan.software.filter(m => m !== id)
      : [...s.missionPlan.software, id]
    return { missionPlan: { ...s.missionPlan, software } }
  }),

  runValidation: () => {
    const { missionPlan } = get()
    const framework = getFramework(missionPlan.frameworkId)
    const validation = validateDesign({
      defs: COMPONENT_DEFS, framework,
      componentIds: missionPlan.components, plan: missionPlan,
    })
    set({ validation })
    return validation
  },

  openCopilot: () => set(s => ({ copilot: { ...s.copilot, open: true } })),
  closeCopilot: () => set(s => ({ copilot: { ...s.copilot, open: false } })),

  runCopilot: async (mode = 'analysis') => {
    const { missionPlan } = get()
    const framework = getFramework(missionPlan.frameworkId)
    set(s => ({ copilot: { ...s.copilot, open: true, running: true, mode } }))
    try {
      const result = await runCopilot(
        { defs: COMPONENT_DEFS, framework, componentIds: missionPlan.components, plan: missionPlan },
        { provider: 'local', mode },
      )
      set({ copilot: { open: true, running: false, result, mode } })
    } catch (err) {
      set({ copilot: { open: true, running: false, mode, result: {
        mode, summary: { headline: `Copiloto indisponível: ${err.message}` }, findings: [],
      } } })
    }
  },

  // Apply a copilot finding action (e.g. add a suggested component).
  applyFinding: (action) => {
    if (!action || action.type !== 'add') return
    set(s => s.missionPlan.components.includes(action.componentId) ? s : {
      missionPlan: { ...s.missionPlan, components: [...s.missionPlan.components, action.componentId] },
      validation: null,
    })
  },

  // Architecture generation pipeline → live entities (digital twin).
  generateArchitectureFromPlan: () => {
    const { missionPlan } = get()
    const framework = getFramework(missionPlan.frameworkId)
    const ids = generateArchitecture({
      defs: COMPONENT_DEFS, framework, componentIds: missionPlan.components,
    })
    const pos = layoutFor(ids)
    const entities = {}
    ids.forEach(id => { entities[id] = makeEntity(id, pos[id], 0) })
    set({
      missionPlan: { ...missionPlan, components: ids },
      mission: {
        id: missionPlan.frameworkId,
        label: missionPlan.name || (framework ? framework.name : 'Missão'),
        description: framework ? framework.tagline : '',
        objectives: missionPlan.objectives,
        constraints: framework?.payload?.note || '',
        altitude: missionPlan.environment.altitude || (framework?.environment?.altitude ?? '—'),
      },
      entities,
      seq: 0, telemetry: [],
      activeSection: 'hardware',
      workflowStep: 'architecture',
      serialLog: [
        { t: clock(0), m: `arquitetura gerada · ${ids.length} módulos`, cls: 'info' },
        ...INITIAL_SERIAL,
      ],
    })
    return ids
  },
}))

export default useForge
