// ──────────────────────────────────────────────────────────────────
// Architecture generation pipeline.
//
// Turns a mission plan (set of chosen component ids + framework) into an
// ordered, complete component list ready to be instantiated as entities.
// It guarantees a coherent baseline (one MCU + a power source) and orders
// the MCU first so the scene/architecture hub resolves predictably.
//
// Pure: catalog (`defs`) injected. The store maps the returned ids to
// entities via its existing makeEntity().
// ──────────────────────────────────────────────────────────────────

export function generateArchitecture({ defs, framework, componentIds = [] }) {
  const ids = new Set(componentIds.filter((id) => defs[id]))

  const hasCategory = (cat) => [...ids].some((id) => defs[id].category === cat)

  // ensure a computer of board
  if (!hasCategory('mcu')) {
    // prefer a framework-suggested MCU, else esp32
    const fromReq = framework?.requirements
      ?.flatMap((r) => r.suggest || [])
      .find((s) => defs[s]?.category === 'mcu')
    ids.add(fromReq || 'esp32')
  }
  // ensure a power source
  if (!hasCategory('power')) ids.add('lipo_2000')

  // order: MCU first, then sensors, comm, storage, power
  const rank = { mcu: 0, sensor: 1, comm: 2, storage: 3, power: 4 }
  const ordered = [...ids].sort((a, b) => (rank[defs[a].category] ?? 9) - (rank[defs[b].category] ?? 9))

  return ordered
}
