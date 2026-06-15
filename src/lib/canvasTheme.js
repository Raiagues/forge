// ──────────────────────────────────────────────────────────────────
// Canvas color tokens — the SINGLE source of truth for every colour used
// in the schematic (SVG) and PCB (three.js/WebGL) views, with a LIGHT and
// a DARK value for each (Part 1: theme consistency audit).
//
// Why a JS module and not CSS variables: the 3D PCB view renders through
// three.js materials, which cannot read CSS custom properties. To keep one
// canonical, theme-aware palette for BOTH views (so colours never drift
// between 2D and 3D), the tokens live here and each view selects its
// palette from the active `theme`. Nothing colour-related in these two
// views should be an inline hex literal — it must come from here.
//
// Contrast intent (WCAG-AA-minded against each theme's canvas background):
//   · schematic light bg ≈ parchment #F6EEDC · dark bg ≈ midnight #0E1E33
//   · PCB board sits on the same backgrounds; copper must stay visible on
//     a dark scene, ground/data nets must stay visible on a light scene.
// ──────────────────────────────────────────────────────────────────

const pick = (theme) => (theme === 'dark' ? 'dark' : 'light')

// Functional net palette (shared by pins + wires): power=red, ground,
// SDA=blue, SCL=amber, TX=green, RX=orange, SPI=violet, GPIO=grey.
// Dark values are lightened/desaturated so they read on midnight; light
// values are deepened so they read on parchment.
export const NET = {
  light: {
    power: '#B83121', gnd: '#243140', sda: '#1F4E96', scl: '#9A7400',
    tx: '#1F7A46', rx: '#B5531A', spi: '#6E3490', gpio: '#5B6873',
  },
  dark: {
    power: '#E0795F', gnd: '#9FB0C0', sda: '#79B0E6', scl: '#E3A132',
    tx: '#5BB587', rx: '#E59B66', spi: '#C49BDE', gpio: '#A39A86',
  },
}

// role → net key (mirrors the wiring role vocabulary)
const ROLE_TO_NET = {
  power3v3: 'power', vcc: 'power', vin: 'power', en: 'power',
  gnd: 'gnd', sda: 'sda', scl: 'scl',
  uart_tx: 'tx', uart_rx: 'rx',
  csb: 'spi', sdo: 'spi', sck: 'spi', mosi: 'spi', miso: 'spi', cs: 'spi',
  gpio: 'gpio',
}

// wire state colours (selection / warning / error) — themed so they stay
// legible on both canvas backgrounds.
export const WIRE_STATE = {
  light: { sel: '#2B6CB0', warn: '#A8691A', err: '#B23A22' },
  dark: { sel: '#79B0E6', warn: '#E3A132', err: '#E0795F' },
}

// PCB (three.js) surfaces. Dark theme uses a lighter FR4 + brighter copper
// + a cooler, higher-contrast grid so traces/pads/silkscreen stay readable
// on the midnight scene background.
export const PCB = {
  light: {
    bg: '#F6EEDC',
    board: '#1E3A1E', boardEdge: '#2A5020', silk: '#9FC59A',
    copper: '#B8762E', pad: '#C98E3F', padLit: '#E0A85A',
    grid: '#9CB39A', gridSection: '#7E9C7C',
  },
  dark: {
    bg: '#0E1E33',
    board: '#21402A', boardEdge: '#3C6E44', silk: '#7FB07A',
    copper: '#E2A75C', pad: '#F0C070', padLit: '#FFD98A',
    grid: '#34506A', gridSection: '#496F8A',
  },
}

export const netColors = (theme) => NET[pick(theme)]
export const wireStateColors = (theme) => WIRE_STATE[pick(theme)]
export const pcbColors = (theme) => PCB[pick(theme)]

// colour for a pin/wire role, themed
export const roleColor = (role, theme) => netColors(theme)[ROLE_TO_NET[role] || 'gpio']

// pick the most meaningful colour for a wire from its two endpoint roles
export const NET_PRIORITY = ['gnd', 'power3v3', 'vcc', 'vin', 'sda', 'scl', 'uart_tx', 'uart_rx', 'csb', 'sdo', 'sck', 'mosi', 'miso', 'en', 'gpio']
