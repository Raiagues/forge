import { create } from 'zustand'
import {
  getFramework, validateDesign, validateLive, runCopilot, generateArchitecture,
  getObjective, resolveObjective, assignPins, economics,
  validateWires, wiringStatusAll, autoWiresFor, i2cPinsFromWires, uartPinsFromWires, i2cAddressFromWires, sameEnd,
  SOFTWARE_MODULES,
} from '../mission/index.js'
import { track } from '../lib/analytics.js'
import { getFeatureInfo } from '../lib/futureFeatures.js'
import { runLogDoctor } from '../debug/logDoctor.js'
import { getScenario, randomScenario, scenarioWires } from '../debug/scenarios.js'

// ──────────────────────────────────────────────────────────────────
// FORGE store — single source of truth for the digital twin.
//
// Everything the UI shows is derived from this store. The mission
// builder progressively fills `missionPlan`; hardware toggles create
// real entities on the PCB immediately; `live` (validation + pin map)
// is recomputed on every relevant change so feedback stays inline and
// alive while the user builds.
// ──────────────────────────────────────────────────────────────────

export const STATUS = { IDLE: 'idle', OK: 'ok', WARN: 'warn', ERR: 'err', SCANNING: 'scanning' }

// I2C/SPI/UART pin map used both for the architecture view and the
// connection metadata stored on each entity.
const BUS_PINS = {
  I2C:  ['SDA → GPIO21', 'SCL → GPIO22'],
  SPI:  ['MOSI → GPIO23', 'MISO → GPIO19', 'SCK → GPIO18', 'CS → GPIO5'],
  UART: ['TX → GPIO16', 'RX → GPIO17'],
}

// Catalog. `friendly` is the human-meaning name shown FIRST in the UI;
// the part number stays as secondary technical identity. Only the parts
// with `supported: true` can be placed today — everything else renders
// as "coming soon" (deliberately restricted hardware set).
export const COMPONENT_DEFS = {
  esp32: {
    id: 'esp32', label: 'ESP32-WROOM-32D', friendly: 'Computador de bordo',
    category: 'mcu', protocol: 'MCU', voltage: '3.3V', mass: 8, current: 240, price: 45,
    color: '#2B3F7A', supported: true,
    caps: ['mcu', 'wifi', 'bluetooth', 'i2c', 'spi', 'uart', 'adc'],
  },
  bmp280: {
    id: 'bmp280', label: 'BMP280', friendly: 'Sensor de temperatura + pressão',
    category: 'sensor', protocol: 'I2C', address: '0x76', voltage: '3.3V', mass: 2, current: 3, price: 15,
    color: '#1E3A28', supported: true,
    measures: ['temperature', 'pressure'],
    caps: ['i2c', 'temperature', 'pressure', 'altitude'],
  },
  mpu6050: {
    id: 'mpu6050', label: 'MPU6050', friendly: 'Giroscópio + acelerômetro',
    category: 'sensor', protocol: 'I2C', address: '0x68', voltage: '3.3V', mass: 3, current: 3.9, price: 12,
    color: '#2A2014', supported: true,
    measures: ['accelerometer', 'gyroscope'],
    caps: ['i2c', 'imu', 'accel', 'gyro'],
  },
  // ── coming soon — visible but not placeable yet ──────────────────
  ccs811:      { id: 'ccs811',      label: 'CCS811',       friendly: 'Sensor de CO₂ e qualidade do ar', category: 'sensor',  protocol: 'I2C',  address: '0x5A', voltage: '3.3V', mass: 2,  current: 30,  price: 20, color: '#1A2A1A', comingSoon: true, caps: ['i2c', 'co2', 'tvoc', 'air-quality'] },
  gps_neo6m: {
    id: 'gps_neo6m', label: 'NEO-6M', friendly: 'Posição GPS',
    category: 'sensor', protocol: 'UART', voltage: '3.3V', mass: 5, current: 50, price: 25,
    color: '#2A1414', supported: true,
    measures: ['position', 'altitude'],
    caps: ['uart', 'gnss', 'position', 'altitude'],
  },
  lora_sx1276: { id: 'lora_sx1276', label: 'SX1276',       friendly: 'Rádio LoRa de longo alcance',     category: 'comm',    protocol: 'SPI',  voltage: '3.3V', mass: 4,  current: 120, price: 35, color: '#2A1E3A', comingSoon: true, caps: ['spi', 'lora', 'rf', 'long-range'] },
  sd_card:     { id: 'sd_card',     label: 'MicroSD',      friendly: 'Cartão de memória',               category: 'storage', protocol: 'SPI',  voltage: '3.3V', mass: 1,  current: 100, price: 8,  color: '#1E2814', comingSoon: true, caps: ['spi', 'storage', 'logging'] },
  lipo_2000:   { id: 'lipo_2000',   label: 'LiPo 2000mAh', friendly: 'Bateria',                         category: 'power',   protocol: null,   voltage: '3.7V', mass: 40, capacity: 2000, price: 30, color: '#2A1E0A', comingSoon: true, caps: ['power', 'battery'] },
}

export const SUPPORTED_IDS = Object.values(COMPONENT_DEFS).filter(d => d.supported).map(d => d.id)

// Legacy quick profiles (kept as data; the builder flow is now primary).
export const MISSION_TEMPLATES = [
  {
    id: 'atmospheric',
    label: 'Monitoramento atmosférico',
    description: 'Temperatura, pressão e dinâmica de voo em altitude estratosférica.',
    altitude: '30 km',
    components: ['esp32', 'bmp280', 'mpu6050'],
    objectives: [
      'Medir temperatura e pressão a 1 Hz durante todo o voo',
      'Registrar perfil vertical de temperatura até 30 km',
      'Estimar dinâmica do payload com IMU de 6 eixos',
    ],
    constraints: 'Massa < 250 g · Telemetria WiFi (OBSAT)',
  },
]

export const SECTIONS = [
  { id: 'mission',      label: 'Mission',      icon: 'target'   },
  { id: 'architecture', label: 'Architecture', icon: 'grid'     },
  { id: 'hardware',     label: 'Hardware',     icon: 'cpu'      },
  { id: 'firmware',     label: 'Firmware',     icon: 'code'     },
  { id: 'debug',        label: 'Debug',        icon: 'bug'      },
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

// Live readings generator. `seq` is a monotonic tick counter so values
// like uptime advance instead of jittering randomly.
function genReadings(id, status, seq = 0) {
  switch (id) {
    case 'bmp280':
      return { temperature: `${f(rnd(20, 26))} °C`, pressure: `${f(rnd(675, 690), 0)} hPa`, altitude_baro: `${f(rnd(680, 720), 0)} m` }
    case 'mpu6050':
      return { accel_x: f(rnd(-0.03, 0.03), 3), accel_y: f(rnd(-0.03, 0.03), 3), accel_z: f(rnd(0.97, 1.02), 3), gyro_x: `${f(rnd(-0.4, 0.4), 2)} °/s`, temp: `${f(rnd(28, 34))} °C` }
    case 'gps_neo6m': {
      // honest cold-start behaviour: satellites accumulate slowly; a fix
      // only appears after enough of them are tracked (sky view assumed)
      const sats = Math.min(9, Math.floor(seq / 6) + Math.round(rnd(0, 2)))
      const fix = sats >= 4
      return {
        fix: fix ? '3D fix' : 'sem fix · buscando',
        satellites: `${sats} visíveis`,
        latitude: fix ? `${f(rnd(-23.56, -23.55), 5)}` : '—',
        longitude: fix ? `${f(rnd(-46.74, -46.73), 5)}` : '—',
        altitude_gps: fix ? `${f(rnd(720, 760), 0)} m` : '—',
        uart: '9600 8N1 · NMEA',
      }
    }
    case 'esp32':
      return { free_heap: `${f(rnd(208, 232), 0)} kB`, wifi_rssi: `${f(rnd(-62, -48), 0)} dBm`, cpu_temp: `${f(rnd(41, 49))} °C`, uptime: `${seq * 3} s` }
    default:
      return {}
  }
}

function genLogs(id) {
  if (id === 'bmp280') return [
    { t: clock(2), m: 'T=24.1 P=682 OK', cls: 'ok' },
    { t: clock(5), m: '0x76 ACK · chip id 0x58 OK', cls: 'ok' },
  ]
  if (id === 'mpu6050') return [
    { t: clock(3), m: 'WHO_AM_I = 0x68 OK', cls: 'ok' },
    { t: clock(6), m: 'I2C 0x68 ACK', cls: 'ok' },
  ]
  if (id === 'esp32') return [
    { t: clock(5), m: 'boot OK · IDF v5.1', cls: 'ok' },
    { t: clock(4), m: 'I2C init SDA=21 SCL=22', cls: 'info' },
    { t: clock(3), m: 'WiFi STA conectando…', cls: 'info' },
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
  return {
    id: compId,
    type: compId,
    def,
    protocol: def.protocol,
    position,
    rotation: [0, 0, 0],
    status: STATUS.OK,
    readings: genReadings(compId, STATUS.OK, seq),
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
    pos[id] = [col * 2.6 - 2.6, 0, row * 2.0 + 1.6]
    i++
  })
  return pos
}

// Free slot for an incrementally added part (avoid overlapping the hub).
function nextFreePosition(entities, def) {
  if (def.category === 'mcu') return [0, 0, 0]
  const taken = Object.values(entities).map(e => e.position)
  const slots = [
    [-2.6, 0, 1.6], [0, 0, 1.6], [2.6, 0, 1.6],
    [-2.6, 0, -1.8], [2.6, 0, -1.8], [0, 0, -1.8],
  ]
  const free = slots.find(s => !taken.some(t => Math.abs(t[0] - s[0]) < 1 && Math.abs(t[2] - s[2]) < 1))
  return free || [rnd(-2.5, 2.5), 0, rnd(-1.5, 2)]
}

const INITIAL_SERIAL = [
  { t: clock(4), m: 'I2C bus pronto · SDA=21 SCL=22', cls: 'info' },
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

const EMPTY_PLAN = {
  frameworkId: null,
  name: '',
  objectives: [],
  objectiveId: null,        // single primary scientific objective
  objectiveMeta: {},        // user edits over the objective's metadata
  budgetBRL: null,          // user-defined budget (R$)
  overrides: {},            // compId → { price, mass, current } user edits
  environment: { platform: '', altitude: '', tempRange: '', notes: '' },
  components: [],           // planned component ids (mirrors entities)
  software: [],             // chosen software module ids
  custom: { description: '' },
}

let noticeSeq = 0
let sectionEnterAt = Date.now() // for section_dwell analytics

const useForge = create((set, get) => {

  // Recompute live validation + pin suggestions + REAL wiring state.
  // Called by every action that changes the design — keeps inline
  // feedback current and entity statuses honest (a sensor only shows
  // as connected when its pins are actually wired).
  const recomputeLive = (partial = {}) => {
    const s = { ...get(), ...partial }
    const componentIds = Object.keys(s.entities)
    const framework = getFramework(s.missionPlan.frameworkId)
    const objective = resolveObjective(s.missionPlan)
    const pins = assignPins(COMPONENT_DEFS, componentIds)
    const wiringIssues = validateWires({ defs: COMPONENT_DEFS, wires: s.wires, componentIds })
    // the wiring engine owns the "sensors without MCU" rule — keep only
    // bus-level conflicts (e.g. duplicate I²C address) from the suggester
    const pinIssues = pins.issues.filter(i => !i.title.startsWith('Sensores sem'))
    const wiring = wiringStatusAll(componentIds, s.wires)
    const validation = validateLive({
      defs: COMPONENT_DEFS, framework, objective,
      componentIds, overrides: s.missionPlan.overrides,
      budgetBRL: s.missionPlan.budgetBRL,
      pinIssues: [...pinIssues, ...wiringIssues],
      softwareIds: s.missionPlan.software, modules: SOFTWARE_MODULES,
    })
    const eco = economics({ defs: COMPONENT_DEFS, componentIds, overrides: s.missionPlan.overrides })

    // honest entity status: wired (simulated OK) vs not connected (idle)
    const entities = {}
    for (const id of componentIds) {
      const e = s.entities[id]
      entities[id] = e.status === STATUS.SCANNING ? e
        : { ...e, status: wiring[id]?.wired ? STATUS.OK : STATUS.IDLE }
    }

    return {
      ...partial,
      entities,
      live: {
        validation, pins: pins.assignments, eco, wiring,
        i2c: i2cPinsFromWires(s.wires),
        uart: uartPinsFromWires(s.wires),
        // effective I²C address per sensor, derived from the SDO strap
        addrs: Object.fromEntries(
          componentIds.map(id => [id, i2cAddressFromWires(id, s.wires)]).filter(([, v]) => v),
        ),
      },
    }
  }

  return {
    project: { name: 'PISCE', competition: 'OBSAT · Fase 2', daysLeft: 26 },
    mission: { id: null, label: '', description: '', objectives: [], constraints: '', altitude: '—' },
    entities: {},
    activeSection: 'mission',
    selectedId: null,
    drawerOpen: false,
    isScanning: false,
    // honest physical link state: only true when a REAL ESP32 is connected
    // via Web Serial (Serial Test tab). Everything else is simulation.
    hwLink: { connected: false, port: '' },
    navWidth: loadNavWidth(),
    seq: 0,
    telemetry: [],            // rolling time-series for the Telemetry charts
    serialLog: INITIAL_SERIAL,
    notice: null,             // lightweight contextual toast { id, message }
    featureInfo: null,        // coming-soon explanation panel { key, ...info }
    firstStageConfirmed: false, // sidebar shows the mission name only after first confirm
    hardwareView: '3d',       // '3d' spatial | '2d' schematic (same hw graph)
    wires: [],                // user-made pin connections [{from:{comp,pin},to:{comp,pin}}]

    // ── mission planning layer (drives the whole platform) ──────────
    missionPlan: { ...EMPTY_PLAN },
    workflowStep: 'framework',
    validation: null,          // last on-demand validation (copilot/legacy)
    live: { validation: null, pins: {}, eco: { massG: 0, priceBRL: 0, currentmA: 0 } },
    copilot: { open: false, running: false, result: null, mode: null },

    // ── firmware workspace ───────────────────────────────────────────
    activeModuleId: 'main',
    firmwareEdits: {},         // moduleId → user-edited code (overrides generator)

    // ── Log Doctor (AI debugging assistant) ─────────────────────────
    logDoctor: { running: false, result: null, input: '', source: null, ratings: {} },

    // ── training scenario (guided troubleshooting exercise) ─────────
    training: { scenarioId: null, startedAt: null, stepIdx: 0, hintsUsed: 0, submissions: [], revealed: false },

    // ── navigation / selection ──────────────────────────────────────
    setSection: (id) => {
      const prev = get().activeSection
      if (prev && prev !== id) track('section_dwell', { section: prev, durationMs: Date.now() - sectionEnterAt })
      sectionEnterAt = Date.now()
      track('nav_click', { section: id })
      set({ activeSection: id })
    },
    selectEntity: (id) => {
      if (id) track('panel_toggle', { panel: 'inspector', action: 'open' })
      set({ selectedId: id, drawerOpen: !!id })
    },
    closeDrawer: () => { track('panel_toggle', { panel: 'inspector', action: 'close' }); set({ drawerOpen: false, selectedId: null }) },

    setNavWidth: (w) => {
      const clamped = Math.min(360, Math.max(170, Math.round(w)))
      try { localStorage.setItem(NAV_KEY, String(clamped)) } catch { /* ignore */ }
      set({ navWidth: clamped })
    },

    notify: (message) => set({ notice: { id: ++noticeSeq, message } }),
    clearNotice: () => set({ notice: null }),
    markFirstStageConfirmed: () => { if (!get().firstStageConfirmed) set({ firstStageConfirmed: true }) },

    // Coming-soon items stay clickable: a single unified bottom-right toast,
    // never a modal. `label` is the user-facing feature name.
    comingSoon: (label) => {
      track('coming_soon_click', { featureId: label })
      set({ notice: { id: ++noticeSeq, message: `${label} · em breve` } })
    },
    // Back-compat shim: any remaining caller routes to the same toast.
    openFeatureInfo: (key) => get().comingSoon(getFeatureInfo(key)?.title || key),
    closeFeatureInfo: () => set({ featureInfo: null }),

    setHwLink: (link) => {
      track('hw_link', { target: link.connected ? 'connected' : 'disconnected' })
      set({ hwLink: link })
    },

    setHardwareView: (v) => { track('hw_view', { target: v }); set({ hardwareView: v }) },

    // ── manual wiring (2D schematic) ─────────────────────────────────
    // Wires persist even when electrically wrong — the error must be
    // SEEN (red wire + explanation), not silently rejected.
    addWire: (from, to) => {
      if (!from || !to || sameEnd(from, to)) return
      const s = get()
      const dup = s.wires.some(w =>
        (sameEnd(w.from, from) && sameEnd(w.to, to)) || (sameEnd(w.from, to) && sameEnd(w.to, from)))
      if (dup) { get().notify('fio já existe'); return }
      const wires = [...s.wires, { from, to }]
      const next = recomputeLive({ wires })
      const newIssue = next.live.validation.issues.find(i => i.wireIndex === wires.length - 1)
      track('wire', {
        target: `${from.comp}.${from.pin}→${to.comp}.${to.pin}`,
        ok: !newIssue || newIssue.severity !== 'error',
      })
      if (newIssue?.severity === 'error') track('wire_invalid', { target: newIssue.title })
      set(next)
      get().pushSerial({
        m: `wire ${from.comp}.${from.pin} → ${to.comp}.${to.pin}${newIssue ? ` · ${newIssue.title}` : ' OK'}`,
        cls: newIssue?.severity === 'error' ? 'err' : newIssue ? 'warn' : 'ok',
      })
    },
    removeWire: (idx) => {
      const wires = get().wires.filter((_, i) => i !== idx)
      track('wire_remove', { target: String(idx) })
      set(recomputeLive({ wires }))
    },
    clearAllWires: () => { track('wire_clear'); set(recomputeLive({ wires: [] })) },

    // Standard wiring for one sensor in one click (still real wires).
    autoWire: (compId) => {
      const s = get()
      const candidates = autoWiresFor(compId).filter(nw =>
        !s.wires.some(w => sameEnd(w.from, nw.from) || sameEnd(w.to, nw.from)))
      if (!candidates.length) return
      track('wire_auto', { target: compId })
      set(recomputeLive({ wires: [...s.wires, ...candidates] }))
      get().pushSerial({ m: `auto-wire ${compId}: ${candidates.length} fios`, cls: 'info' })
    },

    // ── mission template = full state generator (legacy quick profile) ─
    loadTemplate: (templateId) => {
      const tmpl = MISSION_TEMPLATES.find(t => t.id === templateId)
      if (!tmpl) return
      const ids = tmpl.components.filter(id => COMPONENT_DEFS[id]?.supported)
      const pos = layoutFor(ids)
      const entities = {}
      ids.forEach((compId) => { entities[compId] = makeEntity(compId, pos[compId], 0) })
      // quick profiles come pre-wired (standard mapping) — still real wires
      const wires = ids.flatMap(id => autoWiresFor(id))
      track('template_load', { target: templateId })

      set(recomputeLive({
        mission: {
          id: templateId, label: tmpl.label, description: tmpl.description,
          objectives: tmpl.objectives, constraints: tmpl.constraints, altitude: tmpl.altitude,
        },
        missionPlan: { ...get().missionPlan, components: ids },
        entities,
        wires,
        selectedId: null,
        drawerOpen: false,
        activeSection: 'hardware',
        seq: 0,
        telemetry: [],
        serialLog: [
          { t: clock(0), m: `mission '${tmpl.label}' loaded · ${ids.length} parts`, cls: 'info' },
          ...INITIAL_SERIAL,
        ],
      }))
    },

    clearMission: () => set(recomputeLive({
      mission: { id: null, label: '', description: '', objectives: [], constraints: '', altitude: '—' },
      entities: {}, wires: [], selectedId: null, drawerOpen: false, telemetry: [], activeSection: 'mission',
      missionPlan: { ...EMPTY_PLAN },
    })),

    // ── mission draft (manual save / restore, never automatic) ───────
    saveMissionDraft: () => {
      const s = get()
      try {
        localStorage.setItem('forge_mission_draft', JSON.stringify({
          savedAt: new Date().toISOString(),
          missionPlan: s.missionPlan,
          wires: s.wires,
        }))
        track('mission_draft_save', {})
        get().notify('Rascunho salvo')
      } catch { get().notify('Não foi possível salvar o rascunho') }
    },
    loadMissionDraft: (draft) => {
      if (!draft || !draft.missionPlan) return
      const plan = { ...EMPTY_PLAN, ...draft.missionPlan }
      const ids = (plan.components || []).filter(id => COMPONENT_DEFS[id]?.supported)
      const pos = layoutFor(ids)
      const entities = {}
      ids.forEach(id => { entities[id] = makeEntity(id, pos[id], 0) })
      const wires = Array.isArray(draft.wires) ? draft.wires : []
      track('mission_draft_restore', {})
      set(recomputeLive({
        missionPlan: { ...plan, components: ids },
        entities, wires, selectedId: null, drawerOpen: false, activeSection: 'mission',
      }))
    },

    // ── hardware editing (single canonical toggle) ───────────────────
    // Adding/removing hardware updates BOTH the plan and the live PCB so
    // the canvas builds up incrementally while the user configures.
    toggleHardware: (compId) => {
      const def = COMPONENT_DEFS[compId]
      if (!def) return
      // coming-soon parts stay explorable: explain instead of blocking
      if (def.comingSoon) { get().comingSoon(def.friendly || def.label); return }
      const s = get()
      if (s.entities[compId]) {
        // remove cleanly: entity, its wires, plan entry, selection
        const entities = { ...s.entities }; delete entities[compId]
        const components = s.missionPlan.components.filter(c => c !== compId)
        const wires = s.wires.filter(w => w.from.comp !== compId && w.to.comp !== compId)
        const sel = s.selectedId === compId ? null : s.selectedId
        track('component_remove', { componentId: compId })
        set(recomputeLive({
          entities, wires, selectedId: sel, drawerOpen: sel ? s.drawerOpen : false,
          missionPlan: { ...s.missionPlan, components },
        }))
        get().pushSerial({ m: `− ${def.label} removido`, cls: 'info' })
      } else {
        const pos = nextFreePosition(s.entities, def)
        const entities = { ...s.entities, [compId]: makeEntity(compId, pos, s.seq) }
        const components = [...s.missionPlan.components.filter(c => c !== compId), compId]
        track('component_add', { componentId: compId, componentType: def.category })
        set(recomputeLive({ entities, missionPlan: { ...s.missionPlan, components } }))
        get().pushSerial({ m: `+ ${def.label} na placa · aguardando fiação`, cls: 'info' })
      }
    },

    addEntity: (compId) => { if (!get().entities[compId]) get().toggleHardware(compId) },
    removeEntity: (compId) => { if (get().entities[compId]) get().toggleHardware(compId) },

    updatePosition: (id, pos) => set(s => s.entities[id] ? ({ entities: { ...s.entities, [id]: { ...s.entities[id], position: pos } } }) : s),
    updateRotation: (id, rot) => set(s => s.entities[id] ? ({ entities: { ...s.entities, [id]: { ...s.entities[id], rotation: rot } } }) : s),
    updateStatus:   (id, status) => set(s => s.entities[id] ? ({ entities: { ...s.entities, [id]: { ...s.entities[id], status } } }) : s),

    // ── I2C scan simulation — honest: unwired sensors do NOT ACK ────
    runScan: () => {
      const { entities } = get()
      if (get().isScanning || Object.keys(entities).length === 0) return
      track('scan')
      set({ isScanning: true })
      get().pushSerial({ m: 'I2C scan 0x08–0x77 started (simulação)', cls: 'info' })
      Object.keys(entities).forEach(id => {
        if (['I2C', 'SPI'].includes(entities[id].def.protocol)) get().updateStatus(id, STATUS.SCANNING)
      })
      setTimeout(() => {
        const wiring = get().live?.wiring || {}
        Object.keys(get().entities).forEach(id => {
          const e = get().entities[id]
          if (e.status === STATUS.SCANNING) {
            const wired = wiring[id]?.wired
            get().updateStatus(id, wired ? STATUS.OK : STATUS.IDLE)
            const def = e.def
            get().pushSerial({
              m: wired
                ? `${def.protocol} ${def.address || ''} ${def.label} ACK`.replace(/\s+/g, ' ').trim()
                : `${def.address || ''} ${def.label} sem resposta · sensor não conectado`.trim(),
              cls: wired ? 'ok' : 'err',
            })
          }
        })
        get().pushSerial({ m: 'scan complete', cls: 'info' })
        set({ isScanning: false })
      }, 2200)
    },

    // ── live tick: readings + telemetry history ─────────────────────
    // Honest simulation: only WIRED sensors produce readings. An unwired
    // sensor shows no data — never a fake-positive value.
    simulateTick: () => {
      const { entities, seq, live } = get()
      if (Object.keys(entities).length === 0) return
      const nextSeq = seq + 1
      const next = {}
      Object.keys(entities).forEach(id => {
        const e = entities[id]
        const wired = live?.wiring?.[id]?.wired
        next[id] = e.status === STATUS.SCANNING ? e
          : { ...e, readings: wired ? genReadings(id, e.status, nextSeq) : {} }
      })

      const num = (v) => parseFloat(String(v)) || 0
      const wiredOk = (id) => live?.wiring?.[id]?.wired && next[id]
      const sample = {
        t: nextSeq,
        temp:  wiredOk('bmp280') ? num(next.bmp280.readings.temperature) : null,
        press: wiredOk('bmp280') ? num(next.bmp280.readings.pressure) : null,
        accel: wiredOk('mpu6050') ? num(next.mpu6050.readings.accel_z) : null,
        heap:  wiredOk('esp32') ? num(next.esp32.readings.free_heap) : null,
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
    // Mission builder — competition → objective → details → hardware.
    // Thin actions; all rules live in src/mission/*.
    // ────────────────────────────────────────────────────────────────
    selectFramework: (id) => {
      const fw = getFramework(id)
      if (!fw) { get().openFeatureInfo(`framework_${id}`); return }
      track('framework', { target: id })
      set(recomputeLive({
        missionPlan: {
          ...EMPTY_PLAN,
          frameworkId: id,
          name: '',
          environment: { ...fw.environment },
          components: [],
        },
        workflowStep: 'framework',
        validation: null,
        copilot: { open: false, running: false, result: null, mode: null },
      }))
    },

    exitFramework: () => set(recomputeLive({
      missionPlan: { ...EMPTY_PLAN },
      entities: {}, selectedId: null, drawerOpen: false, telemetry: [], seq: 0,
      workflowStep: 'framework', validation: null,
      copilot: { open: false, running: false, result: null, mode: null },
    })),

    setWorkflowStep: (id) => set({ workflowStep: id }),

    // single primary scientific objective (radio behaviour)
    selectObjective: (id) => {
      const obj = getObjective(id)
      if (!obj) return
      track('objective', { target: id })
      set(s => recomputeLive({
        missionPlan: {
          ...s.missionPlan,
          objectiveId: s.missionPlan.objectiveId === id ? null : id,
          objectiveMeta: {},   // edits reset when switching objective
        },
      }))
    },
    setObjectiveMetaField: (key, value) => set(s => recomputeLive({
      missionPlan: { ...s.missionPlan, objectiveMeta: { ...s.missionPlan.objectiveMeta, [key]: value } },
    })),

    setPlanName: (name) => set(s => ({ missionPlan: { ...s.missionPlan, name } })),
    setBudget: (value) => set(s => recomputeLive({
      missionPlan: { ...s.missionPlan, budgetBRL: value === '' || value == null ? null : Math.max(0, Number(value) || 0) },
    })),

    // editable mission economics: per-part price/mass/current overrides
    setOverride: (compId, field, value) => set(s => {
      const cur = s.missionPlan.overrides[compId] || {}
      const next = { ...cur }
      if (value === '' || value == null) delete next[field]
      else next[field] = Math.max(0, Number(value) || 0)
      const overrides = { ...s.missionPlan.overrides, [compId]: next }
      if (Object.keys(next).length === 0) delete overrides[compId]
      return recomputeLive({ missionPlan: { ...s.missionPlan, overrides } })
    }),

    // legacy objective text list (kept for copilot context)
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

    togglePlanComponent: (id) => get().toggleHardware(id),
    togglePlanSoftware: (id) => set(s => {
      const has = s.missionPlan.software.includes(id)
      const software = has
        ? s.missionPlan.software.filter(m => m !== id)
        : [...s.missionPlan.software, id]
      return recomputeLive({ missionPlan: { ...s.missionPlan, software } })
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
      track('copilot', { target: mode })
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

    // Apply a copilot/validation finding action (e.g. add a component).
    applyFinding: (action) => {
      if (!action || action.type !== 'add') return
      if (!get().entities[action.componentId]) get().toggleHardware(action.componentId)
    },

    // ── firmware workspace ───────────────────────────────────────────
    setActiveModule: (id) => { track('module_open', { target: id }); set({ activeModuleId: id }) },
    openModuleInFirmware: (id) => {
      track('module_open', { target: id })
      set({ activeModuleId: id, activeSection: 'firmware' })
    },
    setFirmwareEdit: (moduleId, code) => set(s => {
      if (s.firmwareEdits[moduleId] == null) track('fw_edit', { target: moduleId })
      return { firmwareEdits: { ...s.firmwareEdits, [moduleId]: code } }
    }),
    resetFirmwareEdit: (moduleId) => set(s => {
      const edits = { ...s.firmwareEdits }; delete edits[moduleId]
      return { firmwareEdits: edits }
    }),

    // ────────────────────────────────────────────────────────────────
    // Log Doctor — debugging assistant. Thin wrappers over the pure
    // engine in src/debug/logDoctor.js; every decision the user takes
    // (run, accept, reject, apply fix) is tracked for validation.
    // ────────────────────────────────────────────────────────────────
    runLogDoctorOnText: async (text, source = 'paste') => {
      const trimmed = (text || '').trim()
      if (!trimmed) { get().notify('cole um log para analisar'); return }
      const s = get()
      const ctx = { entities: s.entities, live: s.live, defs: COMPONENT_DEFS }
      track('debug_session', { target: source, lines: trimmed.split('\n').length })
      set({ logDoctor: { ...s.logDoctor, running: true, input: text, source, ratings: {} } })
      try {
        const result = await runLogDoctor({ text: trimmed, ctx }, { provider: 'local' })
        track('debug_result', { target: String(result.findings.length), top: result.findings[0]?.title })
        set(st => ({ logDoctor: { ...st.logDoctor, running: false, result } }))
      } catch (err) {
        track('error', { target: 'log_doctor', message: err.message })
        set(st => ({ logDoctor: { ...st.logDoctor, running: false, result: { findings: [], summary: `falha na análise: ${err.message}` } } }))
      }
    },

    // analyze the in-app serial buffer (simulated or mirrored device log)
    runLogDoctorOnSerial: () => {
      const lines = get().serialLog.map(l => l.m).reverse().join('\n')
      get().runLogDoctorOnText(lines, 'serial')
    },

    rateDoctorFinding: (findingId, accepted) => {
      const s = get()
      const finding = s.logDoctor.result?.findings.find(f => f.id === findingId)
      track(accepted ? 'suggestion_accepted' : 'suggestion_rejected', { target: finding?.title || findingId })
      set({ logDoctor: { ...s.logDoctor, ratings: { ...s.logDoctor.ratings, [findingId]: accepted } } })
    },

    // ────────────────────────────────────────────────────────────────
    // Training scenarios — guided troubleshooting. The scenario seeds
    // the twin (including planted wiring faults) and streams a realistic
    // device log; students investigate and submit a diagnosis. Multiple
    // accepted causes/fixes per scenario; every step is tracked.
    // ────────────────────────────────────────────────────────────────
    startTrainingScenario: (id = null) => {
      const scenario = id ? getScenario(id) : randomScenario()
      if (!scenario) return
      // ensure the exercise hardware is on the board
      if (!get().entities.esp32) get().toggleHardware('esp32')
      if (!get().entities.gps_neo6m) get().toggleHardware('gps_neo6m')
      // seed the twin: replace the GPS wires with the scenario's (which
      // may contain the planted fault, e.g. TX straight-through)
      const s = get()
      const wires = [
        ...s.wires.filter(w => w.from.comp !== 'gps_neo6m' && w.to.comp !== 'gps_neo6m'),
        ...scenarioWires(scenario),
      ]
      track('scenario_started', { target: scenario.id })
      set(recomputeLive({
        wires,
        training: { scenarioId: scenario.id, startedAt: Date.now(), stepIdx: 0, hintsUsed: 0, submissions: [], revealed: false },
        serialLog: [{ t: clock(0), m: `cenário de treino iniciado · ${scenario.title}`, cls: 'info' }],
      }))
    },

    // advance the scenario log one step; returns the delay until the
    // next step (ms) or null when the stream is done. Repeating
    // scenarios loop back past the boot banner, like a real device.
    trainingTick: () => {
      const { training } = get()
      const scenario = getScenario(training.scenarioId)
      if (!scenario) return null
      let idx = training.stepIdx
      if (idx >= scenario.steps.length) {
        const last = scenario.steps[scenario.steps.length - 1]
        if (!/repete/.test(last.m)) return null
        idx = 2 // loop past the boot banner
      }
      const step = scenario.steps[idx]
      get().pushSerial({ m: step.m, cls: step.cls })
      set(st => ({ training: { ...st.training, stepIdx: idx + 1 } }))
      const next = scenario.steps[idx + 1] || (/repete/.test(scenario.steps[scenario.steps.length - 1].m) ? scenario.steps[2] : null)
      return next ? next.d : null
    },

    useTrainingHint: () => {
      const { training } = get()
      const scenario = getScenario(training.scenarioId)
      if (!scenario || training.hintsUsed >= scenario.hints.length) return
      track('scenario_hint', { target: scenario.id, hint: training.hintsUsed + 1 })
      set(st => ({ training: { ...st.training, hintsUsed: st.training.hintsUsed + 1 } }))
    },

    submitTrainingDiagnosis: (causeId, notes = '') => {
      const { training } = get()
      const scenario = getScenario(training.scenarioId)
      if (!scenario) return
      const ok = scenario.accepted.includes(causeId)
      const elapsedS = Math.round((Date.now() - training.startedAt) / 1000)
      track('scenario_submitted', { target: scenario.id, cause: causeId, ok, elapsedS, hints: training.hintsUsed })
      set(st => ({ training: { ...st.training, submissions: [...st.training.submissions, { causeId, ok, notes }] } }))
      return ok
    },

    revealTraining: () => {
      const { training } = get()
      track('scenario_revealed', { target: training.scenarioId, solved: training.submissions.some(s => s.ok) })
      set(st => ({ training: { ...st.training, revealed: true } }))
    },

    stopTrainingScenario: () => {
      track('scenario_stopped', { target: get().training.scenarioId })
      set({ training: { scenarioId: null, startedAt: null, stepIdx: 0, hintsUsed: 0, submissions: [], revealed: false } })
    },

    // execute a suggested fix (wiring action, open code module, inspect)
    applyDoctorFix: (fix, findingTitle) => {
      track('fix_applied', { target: `${fix.kind} · ${fix.label}`, finding: findingTitle })
      const a = fix.action || {}
      if (a.type === 'autowire') { get().autoWire(a.compId) }
      else if (a.type === 'open2d') { set({ hardwareView: '2d', activeSection: 'hardware' }) }
      else if (a.type === 'module') { get().openModuleInFirmware(a.moduleId) }
      else if (a.type === 'inspect') { set({ activeSection: 'hardware' }); get().selectEntity(a.compId) }
      else get().notify('verifique manualmente e rode o diagnóstico de novo')
    },

    // Architecture generation pipeline → live entities (digital twin).
    generateArchitectureFromPlan: () => {
      const { missionPlan } = get()
      const framework = getFramework(missionPlan.frameworkId)
      const ids = generateArchitecture({
        defs: COMPONENT_DEFS, framework, componentIds: missionPlan.components,
      }).filter(id => COMPONENT_DEFS[id]?.supported)
      const pos = layoutFor(ids)
      const entities = {}
      ids.forEach(id => { entities[id] = makeEntity(id, pos[id], 0) })
      track('generate_architecture', { target: String(ids.length) })
      set(recomputeLive({
        missionPlan: { ...missionPlan, components: ids },
        wires: ids.flatMap(id => autoWiresFor(id)),
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
      }))
      return ids
    },
  }
})

export default useForge
