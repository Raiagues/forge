// ──────────────────────────────────────────────────────────────────
// 3D footprints derived from the SAME pin catalog the 2D schematic and
// the wiring validator use (COMPONENT_PINS) — single source of truth,
// so pin counts/labels can never drift between views.
//
// Physical layouts represented:
//   esp32      ESP32-WROOM-32D devkit: 30-pin dual-row header
//              (15 per side, 2.54mm pitch → 0.16 board units)
//   bmp280     GY-BMP280 breakout: 6-pin single row
//   mpu6050    breakout (catalog subset): 5-pin single row
//   gps_neo6m  NEO-6M breakout: 4-pin single row
//
// Coordinates are LOCAL to the component group (entity.position is the
// group origin). Entities are never rotated by the current views, so
// world pin position = entity.position + local offset.
// ──────────────────────────────────────────────────────────────────
import { COMPONENT_PINS } from '../../mission/index.js'

const DUAL_PITCH = 0.16    // ~2.54mm header pitch in board units
const SINGLE_PITCH = 0.18
const PIN_Y = -0.02        // header pins sit just above the board

// body sizes adapt to the real pin count so pitch stays constant
export function footprint(compId, def) {
  const pins = COMPONENT_PINS[compId] || []
  if (!pins.length) {
    // catalog-less part (coming-soon categories) — generic body, no pins
    const size = def?.category === 'power' ? [1.6, 0.16, 0.9] : [0.9, 0.14, 0.7]
    return { size, pins: {} }
  }

  if (pins.some(p => p.side)) {
    // dual-row header (ESP32 devkit): rows along ±Z edges, pins march on X
    const left  = pins.filter(p => p.side === 'L')
    const right = pins.filter(p => p.side === 'R')
    const rows = Math.max(left.length, right.length)
    const span = (rows - 1) * DUAL_PITCH
    const size = [span + 0.5, 0.18, 1.2]
    const map = {}
    left.forEach((p, i)  => { map[p.id] = { x: -span / 2 + i * DUAL_PITCH, y: PIN_Y, z:  size[2] / 2 + 0.07, row: 'front' } })
    right.forEach((p, i) => { map[p.id] = { x: -span / 2 + i * DUAL_PITCH, y: PIN_Y, z: -size[2] / 2 - 0.07, row: 'back' } })
    return { size, pins: map }
  }

  // single-row breakout: one header row along the front (+Z) edge
  const span = (pins.length - 1) * SINGLE_PITCH
  const size = [Math.max(0.9, span + 0.4), 0.14, 0.7]
  const map = {}
  pins.forEach((p, i) => { map[p.id] = { x: -span / 2 + i * SINGLE_PITCH, y: PIN_Y, z: size[2] / 2 + 0.07, row: 'front' } })
  return { size, pins: map }
}

// world-space position of a pin (board-plane Y is handled by callers)
export function pinWorld(entity, fp, pinId) {
  const p = fp.pins[pinId]
  if (!p) return null
  const [ex, , ez] = entity.position
  return [ex + p.x, p.y, ez + p.z]
}
