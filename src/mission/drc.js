// ──────────────────────────────────────────────────────────────────
// DRC — design-rule check over the digital twin. Pure (no store/UI):
// it takes the placed components, the board dimensions and the active
// fab rule, and returns the violations the twin can honestly compute:
//   · trace width below the fab minimum,
//   · components placed outside the board outline,
//   · components overlapping / packed below a safe body clearance.
// It also offers a simple auto-layout that packs everything inside the
// board, nearest-first around the MCU (shorter traces) with clearance.
//
// Honesty note: copper-level trace-to-trace clearance DRC needs real
// routed-geometry, which this twin abstracts — so trace clearance is not
// checked here; trace WIDTH (a single design value) is. Component overlap
// stands in as the placement-level clearance check.
//
// The 3D scene uses arbitrary board units; UNIT_PER_MM maps them to mm so
// every rule is expressed in real millimetres (the default 100×80 mm
// board ≈ the original 8.5×6.8 unit board).
// ──────────────────────────────────────────────────────────────────

export const UNIT_PER_MM = 0.085
export const MM_PER_UNIT = 1 / UNIT_PER_MM
export const BODY_CLEARANCE_MM = 2.0   // safe gap between component bodies

const mm = (units) => units * MM_PER_UNIT

// axis-aligned footprint box in mm (board centred on the origin, XZ plane)
function bboxMm(entity, sizeOf) {
  const s = sizeOf(entity)                       // { w, d } in board units
  const cx = mm(entity.position[0]), cz = mm(entity.position[2])
  const hw = mm(s.w) / 2, hd = mm(s.d) / 2
  return { x0: cx - hw, x1: cx + hw, z0: cz - hd, z1: cz + hd }
}

// smallest gap (mm) between two boxes; negative means they overlap
function gapMm(a, b) {
  const dx = Math.max(a.x0 - b.x1, b.x0 - a.x1)
  const dz = Math.max(a.z0 - b.z1, b.z0 - a.z1)
  if (dx < 0 && dz < 0) return -1                // overlapping on both axes
  return Math.hypot(Math.max(dx, 0), Math.max(dz, 0))
}

export function runDRC({ entities, board, rule, sizeOf }) {
  const ids = Object.keys(entities)
  const violations = []
  const W = board.widthMm, H = board.heightMm
  const boxes = {}
  ids.forEach((id) => { boxes[id] = bboxMm(entities[id], sizeOf) })

  // 1) trace width vs fab minimum
  if (board.traceWidthMm < rule.minTraceMm) {
    violations.push({
      id: 'trace-width', kind: 'trace', severity: 'warn', targets: [],
      message: `Trilha ${board.traceWidthMm} mm < mínimo ${rule.minTraceMm} mm (${rule.name})`,
    })
  }

  // 2) components outside the board outline
  ids.forEach((id) => {
    const b = boxes[id]
    if (b.x0 < -W / 2 - 0.01 || b.x1 > W / 2 + 0.01 || b.z0 < -H / 2 - 0.01 || b.z1 > H / 2 + 0.01) {
      violations.push({
        id: `bounds-${id}`, kind: 'bounds', severity: 'error', targets: [id],
        message: `${entities[id].def.label} ultrapassa a placa (${W}×${H} mm)`,
      })
    }
  })

  // 3) component overlap / insufficient body clearance
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i], c = ids[j]
      const g = gapMm(boxes[a], boxes[c])
      if (g < 0) {
        violations.push({
          id: `overlap-${a}-${c}`, kind: 'overlap', severity: 'error', targets: [a, c],
          message: `${entities[a].def.label} e ${entities[c].def.label} se sobrepõem`,
        })
      } else if (g < BODY_CLEARANCE_MM) {
        violations.push({
          id: `clearance-${a}-${c}`, kind: 'clearance', severity: 'warn', targets: [a, c],
          message: `${entities[a].def.label} e ${entities[c].def.label} a ${g.toFixed(1)} mm (< ${BODY_CLEARANCE_MM} mm)`,
        })
      }
    }
  }

  const errors = violations.filter((v) => v.severity === 'error').length
  const warnings = violations.filter((v) => v.severity === 'warn').length
  // map componentId → worst severity, for canvas markers
  const byComp = {}
  for (const v of violations) {
    for (const t of v.targets) {
      if (byComp[t] !== 'error') byComp[t] = v.severity
    }
  }
  return { violations, errors, warnings, byComp, traceUnderspec: board.traceWidthMm < rule.minTraceMm }
}

// ── auto-layout ─────────────────────────────────────────────────────
// Pack components onto a centred grid that fits inside the board, cells
// sized to the largest footprint plus clearance. The MCU takes the centre
// cell; peripherals fill outward nearest-first, ordered by how many wires
// tie them to the rest (more-connected parts land closer → shorter total
// trace). Returns { id: [x,0,z] } in board units.
export function optimizeLayout({ entities, wires = [], board, sizeOf }) {
  const ids = Object.keys(entities)
  if (!ids.length) return {}

  const maxSide = Math.max(...ids.map((id) => { const s = sizeOf(entities[id]); return Math.max(s.w, s.d) }), 0.9)
  const cell = maxSide + BODY_CLEARANCE_MM * UNIT_PER_MM   // in board units
  const halfW = (board.widthMm * UNIT_PER_MM) / 2
  const halfH = (board.heightMm * UNIT_PER_MM) / 2
  const margin = maxSide / 2

  // candidate cell centres inside the board, nearest-to-centre first
  const cols = Math.max(1, Math.floor((halfW * 2 - margin) / cell))
  const rows = Math.max(1, Math.floor((halfH * 2 - margin) / cell))
  const cands = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c - (cols - 1) / 2) * cell
      const z = (r - (rows - 1) / 2) * cell
      cands.push([x, z])
    }
  }
  cands.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]))

  const deg = (id) => wires.filter((w) => w.from.comp === id || w.to.comp === id).length
  const mcu = ids.find((id) => entities[id].def.category === 'mcu')
  const others = ids.filter((id) => id !== mcu).sort((a, b) => deg(b) - deg(a))
  const ordered = mcu ? [mcu, ...others] : others

  const pos = {}
  ordered.forEach((id, i) => {
    const [x, z] = cands[Math.min(i, cands.length - 1)]
    pos[id] = [x, 0, z]
  })
  return pos
}
