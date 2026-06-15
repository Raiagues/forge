// ──────────────────────────────────────────────────────────────────
// Autorouter — an optimization pass over the board-plane traces (Prompt A
// Part 5). PURE: operates on endpoint coordinates only (the caller maps
// pins→world XZ and applies the result as each wire's `via` bend).
//
// Model: each trace is routed as a Manhattan L (one bend). For a segment
// a→b there are two L options — horizontal-first (corner at [b.x, a.y]) or
// vertical-first (corner at [a.x, b.y]). The router chooses, per trace,
// the option that minimizes (in priority order) trace CROSSINGS on the
// layer, then total LENGTH, preferring axis-aligned routes. This is a
// greedy rip-up-and-reroute pass — the practical, deterministic cousin of
// Lee/A* maze routing for a small, single-layer hobby PCB. A final
// cleanup pass straightens needless bends, merges collinear segments and
// drops redundant vertices.
// ──────────────────────────────────────────────────────────────────

const EPS = 1e-6
const dist = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1])

// the two L-corner options for an a→b trace
const corners = (a, b) => [[b[0], a[1]], [a[0], b[1]]]

// polyline [a, corner, b] for a chosen option (collapses to [a,b] if straight)
function polyline(a, b, opt) {
  const c = corners(a, b)[opt]
  return cleanupRoute([a, c, b])
}

// proper segment-intersection test (ignores shared endpoints / touching)
function segCross(p1, p2, p3, p4) {
  const o = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))
  const onSeg = (a, b, c) => Math.min(a[0], b[0]) - EPS <= c[0] && c[0] <= Math.max(a[0], b[0]) + EPS && Math.min(a[1], b[1]) - EPS <= c[1] && c[1] <= Math.max(a[1], b[1]) + EPS
  // shared endpoint → not a crossing (nets legitimately meet at pads)
  if (samePt(p1, p3) || samePt(p1, p4) || samePt(p2, p3) || samePt(p2, p4)) return false
  const o1 = o(p1, p2, p3), o2 = o(p1, p2, p4), o3 = o(p3, p4, p1), o4 = o(p3, p4, p2)
  if (o1 !== o2 && o3 !== o4) return true
  if (o1 === 0 && onSeg(p1, p2, p3)) return true
  if (o2 === 0 && onSeg(p1, p2, p4)) return true
  if (o3 === 0 && onSeg(p3, p4, p1)) return true
  if (o4 === 0 && onSeg(p3, p4, p2)) return true
  return false
}
const samePt = (a, b) => Math.abs(a[0] - b[0]) < 1e-3 && Math.abs(a[1] - b[1]) < 1e-3

const segments = (pts) => pts.slice(1).map((p, i) => [pts[i], p])
const routeLen = (pts) => segments(pts).reduce((s, [a, b]) => s + dist(a, b), 0)

// crossings between two routes' segments
function crossCount(rA, rB) {
  let n = 0
  for (const [a1, a2] of segments(rA)) for (const [b1, b2] of segments(rB)) if (segCross(a1, a2, b1, b2)) n++
  return n
}

// ── cleanup pass ────────────────────────────────────────────────────
// straighten right-then-left reversals, merge collinear segments, drop
// duplicate/redundant vertices.
export function cleanupRoute(pts) {
  // drop consecutive duplicates
  let out = pts.filter((p, i) => i === 0 || !samePt(p, pts[i - 1]))
  // merge collinear: remove a middle vertex whose neighbours are colinear
  let changed = true
  while (changed && out.length > 2) {
    changed = false
    for (let i = 1; i < out.length - 1; i++) {
      const a = out[i - 1], b = out[i], c = out[i + 1]
      const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
      // collinear, OR b is a backtrack between a and c on the same axis
      const backtrack = (samePt([a[0]], [c[0]]) && (b[0] - a[0]) * (c[0] - b[0]) < 0)
      if (Math.abs(cross) < 1e-3 || backtrack) { out = [...out.slice(0, i), ...out.slice(i + 1)]; changed = true; break }
    }
  }
  return out
}

// ── main routing pass ───────────────────────────────────────────────
// endpoints: [{ a:[x,y], b:[x,y] }]  (skip any with missing coords upstream)
// returns: [{ opt, route, via }] aligned with endpoints (via = bend or null)
export function routeTraces(endpoints, { passes = 3, crossWeight = 1000 } = {}) {
  if (!endpoints.length) return []
  // initial choice: per trace, the shorter / more-axis-aligned L
  const opt = endpoints.map(({ a, b }) => {
    const straight = Math.abs(a[0] - b[0]) < 1e-3 || Math.abs(a[1] - b[1]) < 1e-3
    return straight ? 0 : (Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? 0 : 1)
  })
  const routeAt = (i, o) => polyline(endpoints[i].a, endpoints[i].b, o)

  // greedy rip-up & reroute: for each trace pick the option minimizing
  // (crossings vs all others) * weight + its own length.
  for (let pass = 0; pass < passes; pass++) {
    let improved = false
    for (let i = 0; i < endpoints.length; i++) {
      let best = opt[i], bestScore = Infinity
      for (const o of [0, 1]) {
        const ri = routeAt(i, o)
        let cross = 0
        for (let j = 0; j < endpoints.length; j++) if (j !== i) cross += crossCount(ri, routeAt(j, opt[j]))
        const score = cross * crossWeight + routeLen(ri)
        if (score < bestScore - EPS) { bestScore = score; best = o }
      }
      if (best !== opt[i]) { opt[i] = best; improved = true }
    }
    if (!improved) break
  }

  return endpoints.map((_, i) => {
    const route = routeAt(i, opt[i])
    // via = the single interior bend, or null when the cleaned route is straight
    const via = route.length >= 3 ? route[1] : null
    return { opt: opt[i], route, via }
  })
}

// quality metrics for before/after reporting
export function routeMetrics(routes) {
  let crossings = 0
  for (let i = 0; i < routes.length; i++) for (let j = i + 1; j < routes.length; j++) crossings += crossCount(routes[i].route, routes[j].route)
  const length = routes.reduce((s, r) => s + routeLen(r.route), 0)
  const bends = routes.reduce((s, r) => s + Math.max(0, r.route.length - 2), 0)
  return { crossings, length: Math.round(length * 100) / 100, bends }
}
