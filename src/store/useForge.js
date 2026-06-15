import { create } from 'zustand'
import {
  getFramework, validateDesign, validateLive, runCopilot, generateArchitecture,
  getObjective, resolveObjective, assignPins, economics,
  validateWires, wiringStatusAll, autoWiresFor, i2cPinsFromWires, uartPinsFromWires, i2cAddressFromWires, sameEnd,
  SOFTWARE_MODULES, computeBudgets, getObsatFormat, formatMassMaxG, runConsultant, nextPhase,
  primaryObjectiveId,
} from '../mission/index.js'
import { generateFirmwareFiles } from '../mission/firmwareFiles.js'
import { track } from '../lib/analytics.js'
import { getFeatureInfo } from '../lib/futureFeatures.js'
import { runLogDoctor } from '../debug/logDoctor.js'
import { matchSeed, fallbackBlocks, blocksToText, tutorQuestionForWiringIssue } from '../lib/assistant.js'
import { isWebGPUAvailable, initWebLLM, streamWebLLM } from '../lib/webllm.js'

// ──────────────────────────────────────────────────────────────────
// GuiaSat store — single source of truth for the digital twin.
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
    category: 'mcu', protocol: 'MCU', voltage: '3.3V', mass: 8, current: 240, price: 45, volumeCm3: 13,
    color: '#2B3F7A', supported: true,
    caps: ['mcu', 'wifi', 'bluetooth', 'i2c', 'spi', 'uart', 'adc'],
  },
  bmp280: {
    id: 'bmp280', label: 'BMP280', friendly: 'Sensor de temperatura + pressão',
    category: 'sensor', protocol: 'I2C', address: '0x76', voltage: '3.3V', mass: 2, current: 3, price: 15, volumeCm3: 1,
    color: '#1E3A28', supported: true,
    measures: ['temperature', 'pressure'],
    caps: ['i2c', 'temperature', 'pressure', 'altitude'],
  },
  mpu6050: {
    id: 'mpu6050', label: 'MPU6050', friendly: 'Giroscópio + acelerômetro',
    category: 'sensor', protocol: 'I2C', address: '0x68', voltage: '3.3V', mass: 3, current: 3.9, price: 12, volumeCm3: 1.2,
    color: '#2A2014', supported: true,
    measures: ['accelerometer', 'gyroscope'],
    caps: ['i2c', 'imu', 'accel', 'gyro'],
  },
  // ── coming soon — visible but not placeable yet ──────────────────
  ccs811:      { id: 'ccs811',      label: 'CCS811',       friendly: 'Sensor de CO₂ e qualidade do ar', category: 'sensor',  protocol: 'I2C',  address: '0x5A', voltage: '3.3V', mass: 2,  current: 30,  price: 20, volumeCm3: 1.5, color: '#1A2A1A', comingSoon: true, caps: ['i2c', 'co2', 'tvoc', 'air-quality'] },
  gps_neo6m: {
    id: 'gps_neo6m', label: 'NEO-6M', friendly: 'Posição GPS',
    category: 'sensor', protocol: 'UART', voltage: '3.3V', mass: 5, current: 50, price: 25, volumeCm3: 9,
    color: '#2A1414', comingSoon: true,
    measures: ['position', 'altitude'],
    caps: ['uart', 'gnss', 'position', 'altitude'],
  },
  lora_sx1276: { id: 'lora_sx1276', label: 'SX1276',       friendly: 'Rádio LoRa de longo alcance',     category: 'comm',    protocol: 'SPI',  voltage: '3.3V', mass: 4,  current: 120, price: 35, volumeCm3: 4, color: '#2A1E3A', comingSoon: true, caps: ['spi', 'lora', 'rf', 'long-range'] },
  sd_card:     { id: 'sd_card',     label: 'MicroSD',      friendly: 'Cartão de memória',               category: 'storage', protocol: 'SPI',  voltage: '3.3V', mass: 1,  current: 100, price: 8,  volumeCm3: 2, color: '#1E2814', comingSoon: true, caps: ['spi', 'storage', 'logging'] },
  lipo_2000:   { id: 'lipo_2000',   label: 'LiPo 2000mAh', friendly: 'Bateria',                         category: 'power',   protocol: null,   voltage: '3.7V', mass: 40, capacity: 2000, price: 30, volumeCm3: 26, color: '#2A1E0A', comingSoon: true, caps: ['power', 'battery'] },
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

// Window hierarchy: Mission (home) = WHAT the team is building and why
// (type, framework, objective, identity); Hardware = HOW it is built
// (components, PCB canvas, wiring). The mission context is collected
// once in Mission and consumed read-only everywhere else.
export const SECTIONS = [
  { id: 'mission',      label: 'Mission',      icon: 'target'   },
  { id: 'hardware',     label: 'Hardware',     icon: 'cpu'      },
  { id: 'serialtest',   label: 'Firmware',     icon: 'code'     },
  { id: 'hwtest',       label: 'Testing',      icon: 'lab'      },
  { id: 'telemetry',    label: 'Telemetry',    icon: 'activity' },
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

// Persisted color theme. 'light' (paper, default) | 'dark' (navy). The
// active theme is mirrored onto <html data-theme> so the CSS token blocks
// in index.css take over; applyTheme keeps DOM + storage in sync.
const THEME_KEY = 'forge.theme'
function loadTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY)
    if (t === 'light' || t === 'dark') return t
  } catch { /* SSR / no storage */ }
  return 'light'
}
export function applyTheme(theme) {
  try { document.documentElement.dataset.theme = theme } catch { /* SSR */ }
  try { localStorage.setItem(THEME_KEY, theme) } catch { /* ignore */ }
}

// Persisted sidebar collapse (expandable phase nav ⇄ icon-only rail).
const SIDEBAR_KEY = 'forge.sidebarCollapsed'
function loadSidebarCollapsed() {
  try { return localStorage.getItem(SIDEBAR_KEY) === '1' } catch { return false }
}

const EMPTY_PLAN = {
  // Competition is LOCKED to OBSAT in the redesigned flow (Part 2): there is
  // a single supported competition today, so it is pre-filled, not chosen.
  frameworkId: 'obsat',
  kind: 'competition',
  name: '',
  format: 'cubesat',        // only CubeSat is selectable today (CanSat "em breve")
  cubeU: '1U',              // CubeSat size: '1U' | '2U' | '3U' (scales volume/mass budgets)
  objectives: [],
  objectiveCategories: [],  // visual mission categories (multi-select, Part 2)
  objectiveId: null,        // primary objective (derived from the first category)
  objectiveMeta: {},        // user edits over the objective's metadata
  budgetBRL: null,          // user-defined budget (R$) — headline total, required
  budgetCategories: {},     // optional breakdown: electronics/structure/propulsion/travel/fees
  overrides: {},            // compId → { price, mass, current } user edits
  // team composition. `members` is a roster of { name, role }. `institution`
  // is the university affiliation (also surfaced under restrictions).
  team: { name: '', institution: '', members: [] },
  priorityRanking: [],      // ordered priority ids (visual ranking, Part 2)
  environment: { platform: '', altitude: '', tempRange: '', notes: '' },
  components: [],           // planned component ids (mirrors entities)
  software: [],             // chosen software module ids
  custom: { description: '' },  // free-form mission objective text (legacy)
}

let noticeSeq = 0
let assistantSeq = 0           // message id counter for the AI tutor chat
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
    // satellite format → the real mass/volume/power budget (default CubeSat).
    // CubeSat size (1U/2U/3U) scales the volume + mass envelope.
    const formatId = s.missionPlan.format || framework?.defaultFormat || 'cubesat'
    const cubeU = s.missionPlan.cubeU || '1U'
    const validation = validateLive({
      defs: COMPONENT_DEFS, framework, objective,
      componentIds, overrides: s.missionPlan.overrides,
      budgetBRL: s.missionPlan.budgetBRL,
      pinIssues: [...pinIssues, ...wiringIssues],
      softwareIds: s.missionPlan.software, modules: SOFTWARE_MODULES,
      massMaxG: formatMassMaxG(formatId, cubeU),
    })
    const eco = economics({ defs: COMPONENT_DEFS, componentIds, overrides: s.missionPlan.overrides })
    const budgets = computeBudgets({
      defs: COMPONENT_DEFS, componentIds, overrides: s.missionPlan.overrides,
      formatId, cubeU, budgetBRL: s.missionPlan.budgetBRL,
    })

    // honest entity status: wired (simulated OK) vs not connected (idle)
    const entities = {}
    for (const id of componentIds) {
      const e = s.entities[id]
      entities[id] = e.status === STATUS.SCANNING ? e
        : { ...e, status: wiring[id]?.wired ? STATUS.OK : STATUS.IDLE }
    }

    // effective I²C address per sensor, derived from the SDO strap
    const addrs = Object.fromEntries(
      componentIds.map(id => [id, i2cAddressFromWires(id, s.wires)]).filter(([, v]) => v),
    )

    // flashable firmware set — regenerated whenever hardware or wiring
    // changes. User edits survive only while the generated content is
    // identical; a regeneration discards them (with a toast).
    const fwFiles = generateFirmwareFiles({
      defs: COMPONENT_DEFS, componentIds, wires: s.wires, addrs,
      rateHz: parseFloat(objective?.meta?.rateHz) || 1,
      missionName: s.missionPlan.name,
    })
    const prevGen = Object.fromEntries((get().fwFiles || []).map(f => [f.file, f.code]))
    let fwEdits = s.fwEdits || {}
    let regenerated = false
    for (const name of Object.keys(fwEdits)) {
      const nf = fwFiles.find(f => f.file === name)
      if (!nf || (name in prevGen && nf.code !== prevGen[name])) {
        if (!regenerated) fwEdits = { ...fwEdits }
        delete fwEdits[name]
        regenerated = true
      }
    }

    return {
      ...partial,
      entities,
      fwFiles,
      fwEdits,
      ...(regenerated ? { notice: { id: ++noticeSeq, message: 'Arquivo regenerado — suas edições foram substituídas' } } : {}),
      live: {
        validation, pins: pins.assignments, eco, wiring, budgets,
        i2c: i2cPinsFromWires(s.wires),
        uart: uartPinsFromWires(s.wires),
        addrs,
      },
    }
  }

  return {
    mission: { id: null, label: '', description: '', objectives: [], constraints: '', altitude: '—' },
    entities: {},
    activeSection: 'mission',
    // current step of the mission-definition flow (Part 2). Lifted to the
    // store so the sidebar sub-items + the step pipeline can jump directly
    // to a step. Ids match phases.js → PHASES[mission].sub[].step.
    missionStep: 'team',
    selectedId: null,
    drawerOpen: false,
    isScanning: false,
    // honest physical link state: only true when a REAL ESP32 is connected
    // via Web Serial (Serial Test tab). Everything else is simulation.
    hwLink: { connected: false, port: '' },
    navWidth: loadNavWidth(),
    sidebarCollapsed: loadSidebarCollapsed(),   // expandable phase nav ⇄ icon rail
    theme: loadTheme(),       // 'light' (paper) | 'dark' (navy) — see index.css
    seq: 0,
    telemetry: [],            // rolling time-series for the Telemetry charts
    serialLog: INITIAL_SERIAL,
    notice: null,             // lightweight contextual toast { id, message }
    popover: null,            // anchored disabled/coming-soon popover { id, anchor, message, hint }
    // first-visit onboarding: 'landing' (what is GuiaSat + choose path) →
    // 'flow' (guided mission intake) → null (workspace). Skippable at
    // any point; the chosen context lands in the real missionPlan.
    onboarding: (() => { try { return localStorage.getItem('forge_onboarded') ? null : 'landing' } catch { return 'landing' } })(),
    featureInfo: null,        // coming-soon explanation panel { key, ...info }
    firstStageConfirmed: false, // sidebar shows the mission name only after first confirm
    // Default to the 2D schematic (Part 8): layout starts from the schematic,
    // 3D is opt-in via the large center-top toggle.
    hardwareView: '2d',       // '2d' schematic | '3d' spatial (same hw graph)
    // Mission→Hardware assembly transition (Part 4): null when idle, else
    // { playing, skippable }. Not skippable on first view; skippable after
    // (persisted via forge_seen_assembly_anim).
    transition: null,
    // Phase-transition readiness review (Part 6): null or the phaseId the
    // user is about to advance FROM.
    phaseReview: null,
    // PCB board + fabrication target (drives the board outline + live DRC).
    // ruleId selects the fab design-rule set (NUMAE default, see fabRules).
    board: { widthMm: 100, heightMm: 80, traceWidthMm: 0.3, ruleId: 'numae' },
    dismissedTips: [],        // ids of contextual build-tips the user closed
    // 3D interaction mode. Researched against KiCad/EasyEDA (modal
    // tools) and Figma (direct manipulation): the default 'edit' mode
    // is direct manipulation — drag a chip to move it, drag the
    // background to orbit — which is the least surprising for students.
    // 'navigate' guarantees no accidental edits (every drag orbits);
    // 'route' turns pins into trace endpoints (click pin → click pin).
    canvasMode: 'edit',       // 'edit' | 'navigate' | 'route'
    wires: [],                // user-made pin connections [{from:{comp,pin},to:{comp,pin}}]

    // ── mission planning layer (drives the whole platform) ──────────
    missionPlan: { ...EMPTY_PLAN },
    workflowStep: 'framework',
    validation: null,          // last on-demand validation (copilot/legacy)
    live: { validation: null, pins: {}, eco: { massG: 0, priceBRL: 0, currentmA: 0 }, budgets: null },
    copilot: { open: false, running: false, result: null, mode: null },
    // mission consultant (Part 2): last result { reply, draft[], warnings[] }.
    // provider 'local' (heuristics) or 'anthropic' (backend, model claude-opus-4-8).
    consult: { running: false, result: null, provider: 'local' },

    // ── firmware workspace ───────────────────────────────────────────
    activeModuleId: 'main',
    firmwareEdits: {},         // moduleId → user-edited code (overrides generator)

    // ── flashable firmware set (Serial Test view) ────────────────────
    fwFiles: [],               // generated [{ file, group, compId?, code }]
    fwEdits: {},               // file → user-edited code (overrides generator)

    // ── Log Doctor (AI debugging assistant) ─────────────────────────
    logDoctor: { running: false, result: null, input: '', source: null, ratings: {} },

    // ── AI tutor chat (persistent corner assistant) ────────────────
    // A minimizable hardware-engineering tutor present on every screen.
    // `open` = panel expanded; `unread` badges new answers that arrived
    // while minimized. Answers are blocks (paragraphs + inline diagram
    // keys) from the seeded library; "Learn more" buttons anywhere call
    // askAssistant() so the chat answers without the user typing.
    assistant: { open: false, running: false, unread: 0, messages: [] },
    // free, key-less in-browser LLM (WebLLM/WebGPU). Opt-in + lazy: the
    // model only downloads after enableLocalAI(). `ready` gates streaming.
    ai: { enabled: false, ready: false, loading: false, progress: 0, status: '', supported: isWebGPUAvailable() },

    // ── Hardware test bench (AIT campaign) ──────────────────────────
    // Post-firmware subsystem validation. Results persist for the
    // session so the user can refer back while troubleshooting. Each
    // stage carries a status (idle|running|passed|failed|warn|skipped),
    // its last result and when it ran; `selected` drives multi-select
    // integration tests on the block diagram.
    hwtest: { stages: {}, selected: [], running: null },

    // ── Firmware bring-up screen (Serial Test) ──────────────────────
    // Persistent so the connection status, detected board and diagnostic
    // results survive navigation (Part 4a). The serial EventSource itself
    // lives in src/lib/serialLink.js (a navigation-proof singleton) and
    // feeds this slice through the fwIngest* actions. `hw.found` always
    // reflects the LATEST completed I²C scan so a sensor that stops
    // responding drops out within one poll cycle (Part 4b).
    fw: {
      connected: false,       // live serial link open right now
      wasConnected: false,    // was ever connected this session → auto-reconnect after reload
      detecting: false,
      flashing: false,
      chip: null,             // detected board, e.g. "ESP32-D0WDQ6"
      stages: {},             // pipeline milestone → idle|active|done|error
      hw: { sda: 21, scl: 22, oled: null, bmp: null, mpu: null, i2c: null, oledOk: false, found: [], scanAt: null, scanCount: 0, lastReadAt: null },
      reading: null,          // last "T °C · P hPa" telemetry line
      serial: [],             // raw serial buffer [{t,dir,text}]
      log: [],                // build/flash/detect log [{t,text}]
      diag: [],               // interpreted diagnostic events [{t,text}]
      tab: 'serial',
      expandedStep: null,
      code: null,             // non-mission preset editor content (null → default preset)
    },

    // ── navigation / selection ──────────────────────────────────────
    setSection: (id) => {
      const prev = get().activeSection
      if (prev && prev !== id) track('section_dwell', { section: prev, durationMs: Date.now() - sectionEnterAt })
      sectionEnterAt = Date.now()
      track('nav_click', { section: id })
      // navigating always closes the contextual drawer
      set({ activeSection: id, drawerOpen: false, selectedId: null })
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

    toggleSidebar: () => set(s => {
      const next = !s.sidebarCollapsed
      try { localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0') } catch { /* ignore */ }
      track('sidebar_toggle', { target: next ? 'collapsed' : 'expanded' })
      return { sidebarCollapsed: next }
    }),

    setTheme: (theme) => {
      if (theme !== 'light' && theme !== 'dark') return
      applyTheme(theme)
      track('theme_change', { theme })
      set({ theme })
    },
    toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),

    // toasts take the user's attention — the drawer yields to them
    notify: (message) => set({ notice: { id: ++noticeSeq, message }, drawerOpen: false, selectedId: null }),
    clearNotice: () => set({ notice: null }),
    markFirstStageConfirmed: () => { if (!get().firstStageConfirmed) set({ firstStageConfirmed: true }) },

    // ── onboarding (landing overlay only — the guided flow IS the
    // Mission window, so nothing is ever collected twice) ─────────────
    startGuided: () => {
      track('onboarding', { action: 'guided_start' })
      try { localStorage.setItem('forge_onboarded', '1') } catch { /* ignore */ }
      set({ onboarding: null, activeSection: 'mission' })
    },
    skipOnboarding: () => {
      track('onboarding', { action: 'skip' })
      try { localStorage.setItem('forge_onboarded', '1') } catch { /* ignore */ }
      set({ onboarding: null, activeSection: 'hardware' })
    },
    reopenOnboarding: () => { track('onboarding', { action: 'reopen' }); set({ onboarding: 'landing' }) },
    // mission kind collected by the guided intake (competition /
    // research / hobby / professional) — kept on the plan as context.
    setMissionKind: (kind) => {
      track('onboarding', { action: 'kind', target: kind })
      set(s => ({ missionPlan: { ...s.missionPlan, kind } }))
    },

    // ── anchored popover for disabled / coming-soon interactions ─────
    // User testing: people clicked disabled options repeatedly, got no
    // response and assumed the UI was broken. Every such click now opens
    // a small popover ANCHORED to the clicked element (never a corner
    // toast, never a modal — the feedback must appear where the user is
    // looking, the pattern Linear/Vercel use for unavailable features).
    // anchorEl is the clicked DOM element (OR pass an explicit `anchor`
    // rect {x,y,w,h} when there is none, e.g. a 3D pin); message =
    // one-sentence WHY, hint = optional detail. `learnMore` (a question
    // string) turns the popover into a teaching prompt: it shows a "Saiba
    // mais" button that funnels the question into the AI tutor. `kind`
    // labels the header ('coming' | 'erro' | 'aviso').
    showPopover: ({ anchorEl, anchor, message, hint, learnMore, kind = 'coming' }) => {
      const r = anchorEl?.getBoundingClientRect?.()
      const rect = r ? { x: r.x, y: r.y, w: r.width, h: r.height } : anchor
      if (!rect) { set({ notice: { id: ++noticeSeq, message } }); return }
      set({
        popover: { id: ++noticeSeq, anchor: rect, message, hint, learnMore, kind },
        notice: null,
      })
    },
    closePopover: () => set({ popover: null }),

    // Coming-soon items stay clickable. With an anchor element the
    // feedback is an inline popover (sourced from FUTURE_FEATURES when
    // available); without one it falls back to the toast.
    comingSoon: (label, anchorEl, featureKey) => {
      track('coming_soon_click', { featureId: featureKey || label })
      const info = featureKey ? getFeatureInfo(featureKey) : null
      if (anchorEl) {
        get().showPopover({
          anchorEl,
          message: info ? info.why : `${label} ainda está em desenvolvimento.`,
          hint: info?.planned?.length ? `planejado: ${info.planned[0].toLowerCase()}` : 'disponível em uma versão futura',
        })
        return
      }
      set({ notice: { id: ++noticeSeq, message: `${label} · em breve` }, drawerOpen: false, selectedId: null })
    },
    // Back-compat shim: any remaining caller routes to the same feedback.
    openFeatureInfo: (key) => get().comingSoon(getFeatureInfo(key)?.title || key),
    closeFeatureInfo: () => set({ featureInfo: null }),

    setHwLink: (link) => {
      track('hw_link', { target: link.connected ? 'connected' : 'disconnected' })
      set({ hwLink: link })
    },

    // Enter Hardware through the full-screen assembly animation (Part 4).
    // The satellite the user just defined expands and the camera zooms
    // through its shell into the interior board view that becomes Hardware.
    enterHardware: () => {
      const seen = (() => { try { return !!localStorage.getItem('forge_seen_assembly_anim') } catch { return false } })()
      track('transition', { target: 'mission_to_hardware', skippable: seen })
      set({ transition: { playing: true, skippable: seen } })
    },
    endTransition: () => {
      try { localStorage.setItem('forge_seen_assembly_anim', '1') } catch { /* ignore */ }
      set({ transition: null })
      get().setSection('hardware')
    },

    // ── phase-transition readiness review (Part 6) ───────────────────
    openPhaseReview: (phaseId) => { track('phase_review', { target: phaseId }); set({ phaseReview: phaseId }) },
    closePhaseReview: () => set({ phaseReview: null }),
    // confirm → advance to the next phase's section
    confirmPhaseReview: () => {
      const id = get().phaseReview
      const next = nextPhase(id)
      track('phase_review_confirm', { target: id, next: next?.id || '' })
      set({ phaseReview: null })
      // Mission → Hardware advances THROUGH the assembly animation (the
      // satellite the team just defined opens into the board); other phases
      // navigate straight to the next section.
      if (id === 'mission') get().enterHardware()
      else if (next) get().setSection(next.section)
    },

    setHardwareView: (v) => { track('hw_view', { target: v }); set({ hardwareView: v }) },
    setCanvasMode: (m) => { track('canvas_mode', { target: m }); set({ canvasMode: m }) },

    // ── PCB board + fabrication target (DRC inputs) ──────────────────
    setBoardDim: (field, value) => {
      const v = value === '' || value == null ? '' : Math.max(1, Number(value) || 0)
      track('board_dim', { target: field })
      set(s => ({ board: { ...s.board, [field]: v === '' ? s.board[field] : v } }))
    },
    setFabRule: (id) => { track('fab_rule', { target: id }); set(s => ({ board: { ...s.board, ruleId: id } })) },
    dismissTip: (id) => { track('tip_dismiss', { target: id }); set(s => ({ dismissedTips: [...s.dismissedTips, id] })) },
    // batch-apply a { id: [x,y,z] } layout (used by DRC auto-optimize)
    applyPositions: (map) => set(s => {
      const entities = { ...s.entities }
      for (const id of Object.keys(map)) if (entities[id]) entities[id] = { ...entities[id], position: map[id] }
      return { entities }
    }),

    // ── manual wiring (2D schematic) ─────────────────────────────────
    // Wires persist even when electrically wrong — the error must be
    // SEEN (red wire + explanation), not silently rejected. When an
    // `anchor` rect is given (the destination pin's screen position), an
    // invalid/risky connection also raises a teaching popover right there
    // with a "Saiba mais" button into the AI tutor.
    addWire: (from, to, anchor) => {
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
      // contextual validation feedback: explain the rule where the user is
      // looking, with a one-click path to the deeper tutor explanation
      if (newIssue && anchor) {
        get().showPopover({
          anchor,
          kind: newIssue.severity === 'error' ? 'erro' : 'aviso',
          message: newIssue.title,
          hint: newIssue.detail,
          learnMore: tutorQuestionForWiringIssue(newIssue),
        })
      }
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
        activeSection: 'serialtest',
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
      // restore in place — keep the user on whatever section they're on
      // (restoring from the Hardware page should stay in Hardware)
      set(recomputeLive({
        missionPlan: { ...plan, components: ids },
        entities, wires, selectedId: null, drawerOpen: false,
      }))
    },

    // ── hardware editing (single canonical toggle) ───────────────────
    // Adding/removing hardware updates BOTH the plan and the live PCB so
    // the canvas builds up incrementally while the user configures.
    toggleHardware: (compId, anchorEl) => {
      const def = COMPONENT_DEFS[compId]
      if (!def) return
      const s = get()
      // unsupported parts look normal but answer with an anchored popover
      // explaining why — never enter the mission. Removal of an
      // already-placed part always works.
      if (def.comingSoon && !s.entities[compId]) {
        get().comingSoon(def.friendly || def.label, anchorEl, compId)
        return
      }
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

    // ── component editing (floating toolbar) ─────────────────────────
    // rotate in 90° steps around Y; pins + traces follow (see pinWorldXZ)
    rotateEntity: (id, dir = 1) => set(s => {
      const e = s.entities[id]; if (!e) return s
      const r = e.rotation || [0, 0, 0]
      track('component_rotate', { target: id, dir: dir > 0 ? 'cw' : 'ccw' })
      return { entities: { ...s.entities, [id]: { ...e, rotation: [r[0], (r[1] || 0) + dir * Math.PI / 2, r[2]] } } }
    }),
    // assign to the top or bottom copper layer (a flag on the entity)
    flipEntityLayer: (id) => set(s => {
      const e = s.entities[id]; if (!e) return s
      const layer = e.layer === 'bottom' ? 'top' : 'bottom'
      track('component_flip', { target: layer })
      return { entities: { ...s.entities, [id]: { ...e, layer } } }
    }),
    // a wire's optional bend waypoint (board-plane point) — trace editing
    setWireVia: (idx, via) => set(s => ({ wires: s.wires.map((w, i) => i === idx ? { ...w, via } : w) })),

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
    // satellite form factor → sets the mass/volume/power budget envelope.
    setFormat: (id) => {
      const fmt = getObsatFormat(id)
      track('format', { target: fmt.id })
      set(s => recomputeLive({ missionPlan: { ...s.missionPlan, format: fmt.id } }))
    },
    // CubeSat size (1U/2U/3U) — scales the volume + mass budget envelope.
    setCubeU: (u) => {
      track('cube_u', { target: u })
      set(s => recomputeLive({ missionPlan: { ...s.missionPlan, cubeU: u } }))
    },

    // ── mission-definition flow (Part 2) ─────────────────────────────
    setMissionStep: (step) => set({ missionStep: step }),

    // Visual mission objective categories (multi-select). The first
    // selected category's mapped objective becomes the plan's primary
    // objectiveId so validation + firmware keep their single-objective
    // contract; deselecting all clears it.
    toggleObjectiveCategory: (catId) => set(s => {
      const cur = s.missionPlan.objectiveCategories || []
      const next = cur.includes(catId) ? cur.filter(c => c !== catId) : [...cur, catId]
      const objectiveId = primaryObjectiveId(next)
      return recomputeLive({
        missionPlan: { ...s.missionPlan, objectiveCategories: next, objectiveId, objectiveMeta: {} },
      })
    }),

    // Visual priority ranking — ordered list of priority ids (drag/click to
    // rank). Stored verbatim; the consultant/validation can read the order.
    setPriorityRanking: (ids) => set(s => ({ missionPlan: { ...s.missionPlan, priorityRanking: ids } })),

    // Team roster: { name, role } members (the institution is set via
    // setTeamField). Kept minimal — add/edit/remove.
    addTeamMember: () => set(s => ({
      missionPlan: { ...s.missionPlan, team: { ...s.missionPlan.team, members: [...(s.missionPlan.team.members || []), { name: '', role: '' }] } },
    })),
    setTeamMember: (i, key, value) => set(s => {
      const members = (s.missionPlan.team.members || []).slice()
      if (!members[i]) return s
      members[i] = { ...members[i], [key]: value }
      return { missionPlan: { ...s.missionPlan, team: { ...s.missionPlan.team, members } } }
    }),
    removeTeamMember: (i) => set(s => ({
      missionPlan: { ...s.missionPlan, team: { ...s.missionPlan.team, members: (s.missionPlan.team.members || []).filter((_, j) => j !== i) } },
    })),
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

    // ── consultant flow (Part 2) — team, priorities, AI consultation ──
    setTeamField: (key, value) => set(s => ({
      missionPlan: { ...s.missionPlan, team: { ...s.missionPlan.team, [key]: value } },
    })),
    setPriorities: (text) => set(s => ({ missionPlan: { ...s.missionPlan, priorities: text } })),
    setBudgetCategory: (key, value) => set(s => {
      const cur = { ...s.missionPlan.budgetCategories }
      if (value === '' || value == null) delete cur[key]
      else cur[key] = Math.max(0, Number(value) || 0)
      return { missionPlan: { ...s.missionPlan, budgetCategories: cur } }
    }),

    // Ask the consultant for contextual feedback + a draft component list.
    // Provider seam: local heuristics by default, Anthropic via the backend
    // /consult route when the key is set (auto-falls back to local).
    askConsultant: async ({ provider = 'anthropic' } = {}) => {
      track('consult', { target: provider })
      set(s => ({ consult: { ...s.consult, running: true } }))
      const { missionPlan } = get()
      const framework = getFramework(missionPlan.frameworkId)
      try {
        const result = await runConsultant(
          { defs: COMPONENT_DEFS, plan: missionPlan, framework },
          { provider },
        )
        track('consult_result', { target: String(result.draft?.length || 0), provider: result.provider || 'local' })
        set({ consult: { running: false, result, provider: result.provider || 'local' } })
      } catch (err) {
        set({ consult: { running: false, result: { reply: `Consultor indisponível: ${err.message}`, draft: [], warnings: [] }, provider: 'local' } })
      }
    },
    // Add every drafted component the consultant proposed (one click → board).
    applyConsultDraft: (ids) => {
      const place = ids || get().consult.result?.draft || []
      for (const id of place) if (!get().entities[id] && COMPONENT_DEFS[id]?.supported) get().toggleHardware(id)
    },

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
      set({ activeModuleId: id, activeSection: 'serialtest' })
    },
    setFirmwareEdit: (moduleId, code) => set(s => {
      if (s.firmwareEdits[moduleId] == null) track('fw_edit', { target: moduleId })
      return { firmwareEdits: { ...s.firmwareEdits, [moduleId]: code } }
    }),
    resetFirmwareEdit: (moduleId) => set(s => {
      const edits = { ...s.firmwareEdits }; delete edits[moduleId]
      return { firmwareEdits: edits }
    }),
    // edits over the flashable file set; dropped on regeneration
    setFwEdit: (file, code) => set(s => {
      if (s.fwEdits[file] == null) track('fw_edit', { target: file })
      const gen = s.fwFiles.find(f => f.file === file)
      if (gen && gen.code === code) {
        const edits = { ...s.fwEdits }; delete edits[file]
        return { fwEdits: edits }
      }
      return { fwEdits: { ...s.fwEdits, [file]: code } }
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

    // analyze the serial buffer — REAL device output when a physical
    // ESP32 is connected (Serial Test mirrors its stream here), the
    // simulation otherwise. The source is reported honestly.
    runLogDoctorOnSerial: () => {
      const lines = get().serialLog.map(l => l.m).reverse().join('\n')
      get().runLogDoctorOnText(lines, get().hwLink.connected ? 'serial-real' : 'serial')
    },

    rateDoctorFinding: (findingId, accepted) => {
      const s = get()
      const finding = s.logDoctor.result?.findings.find(f => f.id === findingId)
      track(accepted ? 'suggestion_accepted' : 'suggestion_rejected', { target: finding?.title || findingId })
      set({ logDoctor: { ...s.logDoctor, ratings: { ...s.logDoctor.ratings, [findingId]: accepted } } })
    },

    // execute a suggested fix (wiring action, open code module, inspect)
    applyDoctorFix: (fix, findingTitle) => {
      track('fix_applied', { target: `${fix.kind} · ${fix.label}`, finding: findingTitle })
      const a = fix.action || {}
      if (a.type === 'autowire') { get().autoWire(a.compId) }
      else if (a.type === 'open2d') { set({ hardwareView: '2d', activeSection: 'serialtest' }) }
      else if (a.type === 'module') { get().openModuleInFirmware(a.moduleId) }
      else if (a.type === 'inspect') { set({ activeSection: 'serialtest' }); get().selectEntity(a.compId) }
      else get().notify('verifique manualmente e rode o diagnóstico de novo')
    },

    // ────────────────────────────────────────────────────────────────
    // AI tutor chat — thin actions over the pure engine in
    // src/lib/assistant.js. Local (seeded) provider by default; the live
    // Anthropic provider activates behind the same seam when the backend
    // route + key exist (key stays server-side, never in the bundle).
    // ────────────────────────────────────────────────────────────────
    openAssistant: () => { track('assistant_open'); set(s => ({ assistant: { ...s.assistant, open: true, unread: 0 } })) },
    closeAssistant: () => set(s => ({ assistant: { ...s.assistant, open: false } })),
    toggleAssistant: () => set(s => ({ assistant: { ...s.assistant, open: !s.assistant.open, unread: s.assistant.open ? s.assistant.unread : 0 } })),
    clearAssistant: () => { track('assistant_clear'); set(s => ({ assistant: { ...s.assistant, messages: [] } })) },

    // Turn on the free in-browser model. Lazy: downloads the weights on
    // first enable (cached afterwards), reporting progress into the store.
    enableLocalAI: async () => {
      const ai = get().ai
      if (ai.loading || ai.ready) return
      if (!isWebGPUAvailable()) { get().notify('Este navegador não tem WebGPU — use Chrome/Edge recente'); return }
      track('assistant_local_enable')
      set(s => ({ ai: { ...s.ai, enabled: true, loading: true, progress: 0, status: 'iniciando…' } }))
      try {
        await initWebLLM((r) => set(s => ({ ai: { ...s.ai, progress: r.progress ?? 0, status: r.text || '' } })))
        set(s => ({ ai: { ...s.ai, loading: false, ready: true, status: 'modelo pronto' } }))
      } catch (err) {
        set(s => ({ ai: { ...s.ai, enabled: false, loading: false, ready: false, status: err.message } }))
        get().notify(`Não foi possível carregar a IA local: ${err.message}`)
      }
    },
    disableLocalAI: () => { track('assistant_local_disable'); set(s => ({ ai: { ...s.ai, enabled: false } })) },

    // Ask the tutor a question. Used by the chat input, the suggestion
    // chips and every "Saiba mais" button in the platform — the question
    // is injected and answered without the user typing. Three tiers:
    //  1) seeded library → instant, with inline diagrams (best for core
    //     concepts), 2) local LLM (if enabled+ready) → streamed answer for
    //     open questions, 3) fallback → topic suggestions + enable hint.
    askAssistant: async (question, { open = true } = {}) => {
      const q = (question || '').trim()
      if (!q) return
      track('assistant_ask', { target: q.slice(0, 80) })
      set(s => ({ assistant: {
        ...s.assistant,
        open: open || s.assistant.open,
        running: true,
        messages: [...s.assistant.messages, { id: ++assistantSeq, role: 'user', text: q }],
      } }))
      const bump = (st) => (st.assistant.open ? 0 : st.assistant.unread + 1)

      // 1) seeded library — instant
      const seed = matchSeed(q)
      if (seed) {
        track('assistant_answer', { target: seed.id })
        set(st => ({ assistant: { ...st.assistant, running: false, unread: bump(st),
          messages: [...st.assistant.messages, { id: ++assistantSeq, role: 'assistant', blocks: seed.answer }] } }))
        return
      }

      // 2) local in-browser LLM — streamed
      const ai = get().ai
      if (ai.enabled && ai.ready) {
        const msgId = ++assistantSeq
        const history = get().assistant.messages.map(m => ({ role: m.role, content: m.text ?? blocksToText(m.blocks) }))
        set(st => ({ assistant: { ...st.assistant, messages: [...st.assistant.messages, { id: msgId, role: 'assistant', text: '', streaming: true }] } }))
        try {
          await streamWebLLM(history, { onToken: (delta) => {
            set(st => ({ assistant: { ...st.assistant, messages: st.assistant.messages.map(m => m.id === msgId ? { ...m, text: (m.text || '') + delta } : m) } }))
          } })
          track('assistant_answer', { target: 'webllm' })
          set(st => ({ assistant: { ...st.assistant, running: false, unread: bump(st),
            messages: st.assistant.messages.map(m => m.id === msgId ? { ...m, streaming: false } : m) } }))
        } catch (err) {
          set(st => ({ assistant: { ...st.assistant, running: false,
            messages: st.assistant.messages.map(m => m.id === msgId ? { ...m, streaming: false, text: `Falha no modelo local: ${err.message}` } : m) } }))
        }
        return
      }

      // 3) fallback — offer the topics (and the UI offers to enable the LLM)
      track('assistant_answer', { target: 'fallback' })
      set(st => ({ assistant: { ...st.assistant, running: false, unread: bump(st),
        messages: [...st.assistant.messages, { id: ++assistantSeq, role: 'assistant', blocks: fallbackBlocks() }] } }))
    },

    // ────────────────────────────────────────────────────────────────
    // Hardware test bench (AIT) — thin actions over the pure engine in
    // src/mission/hwtest.js. The panel plays each stage's steps out on a
    // terminal then commits the verdict here so it survives navigation.
    // ────────────────────────────────────────────────────────────────
    // block diagram selection (multi-select for integration tests)
    selectTestBlock: (id, additive = false) => set(s => {
      const cur = s.hwtest.selected
      const has = cur.includes(id)
      const selected = additive
        ? (has ? cur.filter(x => x !== id) : [...cur, id])
        : (has && cur.length === 1 ? [] : [id])
      track('hwtest_select', { target: id, count: selected.length })
      return { hwtest: { ...s.hwtest, selected } }
    }),
    clearTestSelection: () => set(s => ({ hwtest: { ...s.hwtest, selected: [] } })),

    startHwTestStage: (id) => {
      track('hwtest_run', { target: id })
      set(s => ({ hwtest: { ...s.hwtest, running: id, stages: { ...s.hwtest.stages, [id]: { ...s.hwtest.stages[id], status: 'running' } } } }))
    },
    finishHwTestStage: (id, result) => {
      track('hwtest_result', { target: id, status: result.status })
      set(s => ({ hwtest: { ...s.hwtest, running: null, stages: { ...s.hwtest.stages, [id]: { status: result.status, result, ranAt: new Date().toISOString() } } } }))
    },
    // proceed past a failed/parcial gate — explicit, with a UI warning
    skipHwTestGate: (id) => {
      track('hwtest_gate_skip', { target: id })
      set(s => ({ hwtest: { ...s.hwtest, stages: { ...s.hwtest.stages, [id]: { ...s.hwtest.stages[id], status: 'skipped' } } } }))
    },
    resetHwTest: () => { track('hwtest_reset'); set({ hwtest: { stages: {}, selected: [], running: null } }) },

    // ── Firmware bring-up actions (fed by src/lib/serialLink.js) ─────
    // All bring-up state lives in the store so it survives navigation;
    // the serial parsing is here (not in the component) so the link
    // singleton can keep updating it even when the screen is unmounted.
    fwPatch: (patch) => set(s => ({ fw: { ...s.fw, ...patch } })),
    fwPatchHw: (patch) => set(s => ({ fw: { ...s.fw, hw: { ...s.fw.hw, ...patch } } })),
    fwSetStage: (id, status) => set(s => (s.fw.stages[id] === status ? {} : { fw: { ...s.fw, stages: { ...s.fw.stages, [id]: status } } })),
    fwSetTab: (tab) => set(s => ({ fw: { ...s.fw, tab } })),
    fwSetExpandedStep: (id) => set(s => ({ fw: { ...s.fw, expandedStep: id } })),
    fwSetCode: (code) => set(s => ({ fw: { ...s.fw, code } })),
    fwPushSerial: (dir, text) => set(s => ({ fw: { ...s.fw, serial: [...s.fw.serial, { t: clock(0), dir, text }].slice(-600) } })),
    fwPushLog: (text) => set(s => ({ fw: { ...s.fw, log: [...s.fw.log, { t: clock(0), text }].slice(-600) } })),
    fwClearSerial: () => set(s => ({ fw: { ...s.fw, serial: [] } })),
    fwClearLog: () => set(s => ({ fw: { ...s.fw, log: [] } })),
    fwSetConnected: (connected) => {
      set(s => ({ fw: { ...s.fw, connected, wasConnected: s.fw.wasConnected || connected } }))
      get().setHwLink({ connected, port: connected ? 'bridge · 115200' : '' })
    },
    // dedup notes against the most recent one only (so a reboot can re-note)
    fwNote: (text) => set(s => {
      if (s.fw.diag[s.fw.diag.length - 1]?.text === text) return {}
      return { fw: { ...s.fw, diag: [...s.fw.diag, { t: clock(0), text }].slice(-200) } }
    }),
    // reset everything the next flash will re-prove (keep the detected board)
    fwResetForFlash: () => set(s => ({
      fw: { ...s.fw, stages: { board: s.fw.stages.board }, reading: null,
        hw: { ...s.fw.hw, oled: null, bmp: null, mpu: null, i2c: null, oledOk: false, found: [], scanCount: 0 } },
    })),

    // Parse a REAL serial line into pipeline stages + hardware facts.
    // `found` is cleared at each scan start and rebuilt, so it always
    // reflects the latest poll cycle (active diagnostic, Part 4b).
    fwIngestSerial: (line) => {
      const { fwSetStage, fwPatchHw, fwNote } = get()
      fwSetStage('active', 'done')
      if (/rst:0x|ets [A-Z][a-z]{2} |SPI_FAST_FLASH_BOOT|entry 0x/.test(line)) {
        fwSetStage('reboot', 'done'); fwSetStage('board', 'done')
        fwNote('Placa reiniciou — recuperando stream serial')
      }
      if (/=== ESP32 START ===/.test(line)) { fwSetStage('active', 'done'); fwSetStage('board', 'done'); fwNote('Handshake da placa estabelecido') }
      if (/Scanning I2C/i.test(line)) { fwPatchHw({ i2c: null, found: [] }); fwNote('Varredura I2C iniciada') }
      let m = line.match(/Found device at (0x[0-9a-fA-F]+)/i)
      if (m) {
        const a = m[1].toLowerCase()
        set(s => {
          const found = s.fw.hw.found.includes(a) ? s.fw.hw.found : [...s.fw.hw.found, a]
          return { fw: { ...s.fw, hw: { ...s.fw.hw, found,
            oled: a === '0x3c' || a === '0x3d' ? a : s.fw.hw.oled,
            bmp: a === '0x76' || a === '0x77' ? a : s.fw.hw.bmp,
            mpu: a === '0x68' || a === '0x69' ? a : s.fw.hw.mpu } } }
        })
        fwNote(`Dispositivo I2C em ${a}`)
      }
      m = line.match(/Devices found:\s*(\d+)/i)
      if (m) { const n = +m[1]; fwPatchHw({ i2c: n, scanAt: Date.now(), scanCount: get().fw.hw.scanCount + 1 }); fwNote(`Varredura I2C concluída — ${n} dispositivo(s)`) }
      if (/OLED OK/.test(line)) { fwPatchHw({ oledOk: true, oled: get().fw.hw.oled || '0x3c' }); fwNote('OLED respondeu em 0x3c') }
      if (/OLED FAILED/.test(line)) fwPatchHw({ oledOk: false })
      m = line.match(/\[?BMP280\]? OK(?: @ (0x[0-9a-fA-F]+))?/)
      if (m) { const at = m[1]?.toLowerCase(); fwSetStage('sensor', 'done'); fwPatchHw({ bmp: at || get().fw.hw.bmp || '0x76' }); fwNote(`BMP280 reconhecido em ${at || get().fw.hw.bmp || '0x76'}`) }
      if (/BMP280 (NOT FOUND|missing)|\[BMP280\] nao encontrado/i.test(line)) { fwSetStage('sensor', 'error'); fwNote('BMP280 não inicializou — veja o painel de diagnóstico') }
      m = line.match(/\[?MPU6050\]? OK(?: @ (0x[0-9a-fA-F]+))?/)
      if (m) { const at = m[1]?.toLowerCase(); fwSetStage('sensor', 'done'); fwPatchHw({ mpu: at || get().fw.hw.mpu || '0x68' }); fwNote(`MPU6050 reconhecido em ${at || get().fw.hw.mpu || '0x68'}`) }
      if (/MPU6050 (NOT FOUND|missing|não encontrado)/i.test(line)) { fwSetStage('sensor', 'error'); fwNote('MPU6050 não inicializou — veja o painel de diagnóstico') }
      // readings — preset and generated-firmware formats
      m = line.match(/Temp:\s*([\d.-]+)\s*C\s*Pressure:\s*([\d.-]+)/i) || line.match(/\[BMP280\] T=([\d.-]+) P=([\d.-]+)/)
      if (m) { set(s => ({ fw: { ...s.fw, reading: `${m[1]} °C · ${m[2]} hPa`, hw: { ...s.fw.hw, lastReadAt: Date.now() } } })); fwSetStage('telem', 'done'); fwNote('Telemetria fluindo') }
      // MPU6050 streamed orientation/motion → drives the digital twin.
      // Accept whatever the device emits (Part: "support both"): a fused
      // quaternion, Euler angles, or raw accel/gyro — in priority order.
      let imu = null
      const mq = line.match(/q(?:uat)?\s*[:=]?\s*(-?[\d.]+)[ ,]+(-?[\d.]+)[ ,]+(-?[\d.]+)[ ,]+(-?[\d.]+)/i)
        || line.match(/qw[=:]\s*(-?[\d.]+)[ ,]+qx[=:]\s*(-?[\d.]+)[ ,]+qy[=:]\s*(-?[\d.]+)[ ,]+qz[=:]\s*(-?[\d.]+)/i)
      if (mq) imu = { quat: { w: +mq[1], x: +mq[2], y: +mq[3], z: +mq[4] } }
      const me = line.match(/roll[=:]\s*(-?[\d.]+)[ ,]+pitch[=:]\s*(-?[\d.]+)[ ,]+yaw[=:]\s*(-?[\d.]+)/i)
      if (me) imu = { ...(imu || {}), euler: { roll: +me[1], pitch: +me[2], yaw: +me[3] } }
      const ma = line.match(/(?:ax|accel)[=:]?\s*(-?[\d.]+)[ ,]+(?:ay)[=:]?\s*(-?[\d.]+)[ ,]+(?:az)[=:]?\s*(-?[\d.]+)(?:[ ,]+(?:gx)[=:]?\s*(-?[\d.]+)[ ,]+(?:gy)[=:]?\s*(-?[\d.]+)[ ,]+(?:gz)[=:]?\s*(-?[\d.]+))?/i)
      if (ma && /\bMPU6050\b|\bax\b|accel|\bgx\b/i.test(line)) imu = { ...(imu || {}), ax: +ma[1], ay: +ma[2], az: +ma[3], gx: ma[4] != null ? +ma[4] : null, gy: ma[5] != null ? +ma[5] : null, gz: ma[6] != null ? +ma[6] : null }
      if (imu) {
        set(s => ({ fw: { ...s.fw, hw: { ...s.fw.hw, lastReadAt: Date.now(), imu: { ...imu, at: Date.now() } } } }))
        get().fwSetStage('telem', 'done')
      }
    },

    fwIngestLog: (line) => {
      const { fwSetStage } = get()
      if (/Compiling\.\.\./i.test(line)) fwSetStage('compile', 'active')
      if (/Uploading\.\.\./i.test(line)) { fwSetStage('compile', 'done'); fwSetStage('upload', 'active') }
      const m = line.match(/Chip type:\s*(ESP32[^\s(]*)/i) || line.match(/Detecting chip type\.{0,3}\s*(ESP32\S*)/i)
      if (m) { get().fwPatch({ chip: m[1] }); fwSetStage('board', 'done') }
      if (/Flash complete/i.test(line)) fwSetStage('upload', 'done')
      if (/compile failed/i.test(line)) fwSetStage('compile', 'error')
      if (/upload failed/i.test(line)) fwSetStage('upload', 'error')
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
        activeSection: 'serialtest',
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
