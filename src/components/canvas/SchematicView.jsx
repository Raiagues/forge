import { useEffect, useMemo, useRef, useState } from 'react'
import useForge from '../../store/useForge'
import { COMPONENT_PINS, SOURCE_LABEL } from '../../mission/index.js'
import { track } from '../../lib/analytics.js'

// ──────────────────────────────────────────────────────────────────
// SchematicView — 2D systems view of the same hardware graph as the
// 3D board, with prototyping-style manual pin wiring AND a draggable,
// pan/zoomable canvas (Part 5):
//   · click a pin → click a destination pin → wire
//   · DRAG a component body to reposition it (pins + wires follow)
//   · DRAG empty space to pan · SCROLL to zoom
//   · select a component → rotate it 90° (toolbar)
//   · choose the wire style (orthogonal / straight / curved)
//   · wires are coloured by pin FUNCTION, matching the pin indicators
//   · right-click a component → "esconder" (it + its wires fade to 15%);
//     a "mostrar escondidos" button restores them
//   valid wires render in their function colour; invalid wires render
//   red/amber dashed with the violated rule written on the wire.
// Shares all state with the 3D view (entities, wires, validation).
// ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: "'Space Mono', monospace" }

const WIRE_ERR = '#C04030'
const WIRE_WARN = '#C8831A'
const WIRE_SEL = '#4A7DD4'

// pin/wire palette by FUNCTION (Part 5). Pins and the wires leaving them
// share these colours so the schematic reads at a glance:
//   power=vermelho · terra=preto · SDA=azul · SCL=amarelo ·
//   TX=verde · RX=laranja · SPI=roxo · GPIO=cinza
const ROLE_COLOR = {
  power3v3: '#C0392B', vcc: '#C0392B', vin: '#C0392B', en: '#C0392B',
  gnd: '#222222',
  sda: '#2B5EA7', scl: '#C9A227',
  uart_tx: '#2E8B57', uart_rx: '#D2691E',
  csb: '#7D3C98', sdo: '#7D3C98', sck: '#7D3C98', mosi: '#7D3C98', miso: '#7D3C98', cs: '#7D3C98',
  gpio: '#8A8378',
}
const roleColor = (role) => ROLE_COLOR[role] || '#8A8378'
// specificity order so a wire takes the colour of its most meaningful end
const ROLE_PRIORITY = ['gnd', 'power3v3', 'vcc', 'vin', 'sda', 'scl', 'uart_tx', 'uart_rx', 'csb', 'sdo', 'sck', 'mosi', 'miso', 'en', 'gpio']

const WIRE_STYLES = [
  { id: 'orthogonal', label: 'ortogonal' },
  { id: 'straight', label: 'reto' },
  { id: 'curved', label: 'curvo' },
]

const PIN_SPACING = 28
const ESP_W = 216
const SENSOR_W = 180

const ESP_RIGHT = COMPONENT_PINS.esp32.filter(p => p.side === 'L').map(p => p.id)
const ESP_LEFT = COMPONENT_PINS.esp32.filter(p => p.side === 'R').map(p => p.id)

// Deterministic BASE layout: ESP32 on the left (pins on both sides),
// sensors stacked on the right. Per-component drag offsets + rotations are
// applied on top of this at render time (so the base is reproducible).
function layout(entityIds) {
  const blocks = {}
  const pinPos = {}
  const esp = entityIds.includes('esp32')
  const sensors = entityIds.filter(id => id !== 'esp32' && COMPONENT_PINS[id])

  if (esp) {
    const rows = Math.max(ESP_RIGHT.length, ESP_LEFT.length)
    const h = rows * PIN_SPACING + 46
    const x = 96, y = 60
    blocks.esp32 = { x, y, w: ESP_W, h }
    ESP_RIGHT.forEach((pin, i) => {
      pinPos[`esp32.${pin}`] = { x: x + ESP_W, y: y + 38 + i * PIN_SPACING, side: 'right' }
    })
    ESP_LEFT.forEach((pin, i) => {
      pinPos[`esp32.${pin}`] = { x, y: y + 38 + i * PIN_SPACING, side: 'left' }
    })
  }
  let y = 70
  for (const id of sensors) {
    const pins = COMPONENT_PINS[id]
    const h = pins.length * PIN_SPACING + 46
    blocks[id] = { x: 540, y, w: SENSOR_W, h }
    pins.forEach((p, i) => {
      pinPos[`${id}.${p.id}`] = { x: 540, y: y + 38 + i * PIN_SPACING, side: 'left' }
    })
    y += h + 30
  }
  const height = Math.max(esp ? blocks.esp32.y + blocks.esp32.h + 60 : 0, y + 20, 420)
  return { blocks, pinPos, width: 840, height }
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// wire path for a given style between two points
function wirePath(a, b, style) {
  if (style === 'straight') return `M ${a.x} ${a.y} L ${b.x} ${b.y}`
  if (style === 'curved') {
    const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5)
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y} ${b.x - dx} ${b.y} ${b.x} ${b.y}`
  }
  const mx = (a.x + b.x) / 2   // orthogonal dogleg through the midpoint
  return `M ${a.x} ${a.y} L ${mx} ${a.y} L ${mx} ${b.y} L ${b.x} ${b.y}`
}

export default function SchematicView() {
  const {
    entities, wires, addWire, removeWire, clearAllWires, autoWire,
    selectEntity, selectedId, live,
  } = useForge()
  const entityIds = Object.keys(entities)
  const { blocks, pinPos, width, height } = useMemo(() => layout(entityIds), [entityIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const [pending, setPending] = useState(null)     // selected origin pin { comp, pin }
  const [selWire, setSelWire] = useState(null)     // selected wire index
  const [mouse, setMouse] = useState(null)         // pending-wire cursor (content coords)
  const [hoverPin, setHoverPin] = useState(null)
  const [drag, setDrag] = useState({})             // id → { dx, dy } position offset
  const [rot, setRot] = useState({})               // id → degrees (0/90/180/270)
  const [hidden, setHidden] = useState({})         // id → true (faded out)
  const [wireStyle, setWireStyle] = useState('orthogonal')
  const [view, setView] = useState({ tx: 0, ty: 0, scale: 1 })
  const [ctxMenu, setCtxMenu] = useState(null)     // { id, x, y } client coords
  const svgRef = useRef()
  // live drag/pan bookkeeping (refs so window handlers see fresh values)
  const action = useRef(null)                      // { kind:'comp'|'pan', id, x0, y0, moved }

  const validation = live?.validation
  const wiringIssues = (validation?.issues || []).filter(i => i.source === 'wiring')
  const issueByWire = {}
  wiringIssues.forEach(i => { if (i.wireIndex != null && !issueByWire[i.wireIndex]) issueByWire[i.wireIndex] = i })

  const pinDef = (comp, pin) => COMPONENT_PINS[comp]?.find(p => p.id === pin)
  const pinRole = (end) => pinDef(end.comp, end.pin)?.role

  // effective pin position: base, rotated around the block centre, then
  // shifted by the component's drag offset — wires use exactly these.
  const effPin = (comp, pinId) => {
    const base = pinPos[`${comp}.${pinId}`]
    const b = blocks[comp]
    if (!base || !b) return null
    let { x, y } = base
    const r = rot[comp] || 0
    if (r) {
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2
      const rad = (r * Math.PI) / 180, dx = x - cx, dy = y - cy
      x = cx + dx * Math.cos(rad) - dy * Math.sin(rad)
      y = cy + dx * Math.sin(rad) + dy * Math.cos(rad)
    }
    const d = drag[comp]
    if (d) { x += d.dx; y += d.dy }
    return { x, y, side: base.side }
  }
  const blockCenter = (id) => {
    const b = blocks[id]; const d = drag[id] || { dx: 0, dy: 0 }
    return { x: b.x + b.w / 2 + d.dx, y: b.y + b.h / 2 + d.dy }
  }

  const wireColor = (w) => {
    const ra = pinRole(w.from), rb = pinRole(w.to)
    let best = null
    for (const role of ROLE_PRIORITY) { if (ra === role || rb === role) { best = role; break } }
    return roleColor(best || ra || rb)
  }

  // keyboard: Esc cancels · Delete removes selected wire · R rotates selection
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'Escape') {
        setPending(null); setMouse(null); setSelWire(null); setCtxMenu(null)
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selWire != null) {
        e.preventDefault(); removeWire(selWire); setSelWire(null)
      } else if ((e.key === 'r' || e.key === 'R') && selectedId) {
        rotateSelected()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selWire, removeWire, selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (selWire != null && selWire >= wires.length) setSelWire(null) }, [wires.length, selWire])

  // client coords → content coords (undo viewBox fit AND the pan/zoom g)
  const toContent = (clientX, clientY) => {
    const r = svgRef.current?.getBoundingClientRect()
    if (!r) return { x: 0, y: 0 }
    const sx = width / r.width, sy = height / r.height
    const vbx = (clientX - r.left) * sx, vby = (clientY - r.top) * sy
    return { x: (vbx - view.tx) / view.scale, y: (vby - view.ty) / view.scale }
  }

  // ── zoom (native non-passive wheel so we can prevent page scroll) ──
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const sx = width / r.width, sy = height / r.height
      const vbx = (e.clientX - r.left) * sx, vby = (e.clientY - r.top) * sy
      setView(v => {
        const next = clamp(v.scale * (e.deltaY < 0 ? 1.12 : 0.89), 0.4, 3)
        const cx = (vbx - v.tx) / v.scale, cy = (vby - v.ty) / v.scale
        return { scale: next, tx: vbx - cx * next, ty: vby - cy * next }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [width, height])

  // ── drag (component) + pan (background) ───────────────────────────
  useEffect(() => {
    const onMove = (e) => {
      const a = action.current
      if (!a) { if (pending) setMouse(toContent(e.clientX, e.clientY)); return }
      const r = svgRef.current.getBoundingClientRect()
      const sx = width / r.width, sy = height / r.height
      const dxC = (e.clientX - a.x0) * sx / view.scale
      const dyC = (e.clientY - a.y0) * sy / view.scale
      if (Math.abs(e.clientX - a.x0) + Math.abs(e.clientY - a.y0) > 3) a.moved = true
      if (a.kind === 'comp') {
        setDrag(d => ({ ...d, [a.id]: { dx: a.base.dx + dxC, dy: a.base.dy + dyC } }))
      } else {
        setView(v => ({ ...v, tx: a.tx0 + (e.clientX - a.x0) * sx, ty: a.ty0 + (e.clientY - a.y0) * sy }))
      }
    }
    const onUp = () => {
      const a = action.current
      if (a && a.kind === 'comp' && !a.moved) selectEntity(a.id)   // a click, not a drag
      action.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [pending, view.scale, selectEntity]) // eslint-disable-line react-hooks/exhaustive-deps

  const startCompDrag = (id, e) => {
    if (e.button !== 0) return
    e.stopPropagation()
    setCtxMenu(null)
    action.current = { kind: 'comp', id, x0: e.clientX, y0: e.clientY, moved: false, base: drag[id] || { dx: 0, dy: 0 } }
  }
  const startPan = (e) => {
    if (e.button !== 0) return
    setSelWire(null)
    if (selectedId) selectEntity(null)
    action.current = { kind: 'pan', x0: e.clientX, y0: e.clientY, moved: false, tx0: view.tx, ty0: view.ty }
  }

  const rotateSelected = () => {
    if (!selectedId) return
    track('schematic_rotate', { target: selectedId })
    setRot(r => ({ ...r, [selectedId]: ((r[selectedId] || 0) + 90) % 360 }))
  }
  const hideComp = (id) => { track('schematic_hide', { target: id }); setHidden(h => ({ ...h, [id]: true })); setCtxMenu(null); if (selectedId === id) selectEntity(null) }
  const showAll = () => setHidden({})
  const resetView = () => setView({ tx: 0, ty: 0, scale: 1 })

  const clickPin = (comp, pin, anchorEl) => {
    setSelWire(null)
    if (!pending) {
      track('pin_select', { target: `${comp}.${pin}` })
      setPending({ comp, pin })
    } else if (pending.comp === comp && pending.pin === pin) {
      setPending(null); setMouse(null)
    } else {
      const r = anchorEl?.getBoundingClientRect?.()
      const anchor = r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null
      addWire(pending, { comp, pin }, anchor)
      setPending(null); setMouse(null)
    }
  }

  if (entityIds.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ ...mono, fontSize: 13, color: 'var(--ink4)' }}>placa vazia — adicione componentes na missão</span>
      </div>
    )
  }

  const hiddenCount = Object.values(hidden).filter(Boolean).length

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--paper)' }} onClick={() => setCtxMenu(null)}>
      {/* toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        <span style={{ ...mono, fontSize: 12, color: 'var(--ink3)', letterSpacing: '.06em' }}>
          {pending
            ? `${pending.comp}.${pending.pin} → clique no destino · Esc cancela`
            : selWire != null
              ? 'fio selecionado · Delete remove'
              : 'arraste para mover · role para zoom · arraste o fundo para deslocar'}
        </span>
        <div style={{ flex: 1 }} />

        {/* wire style selector */}
        <span style={{ ...mono, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink4)' }}>fios</span>
        <div style={{ display: 'flex', gap: 2 }}>
          {WIRE_STYLES.map(s => (
            <button key={s.id} onClick={() => setWireStyle(s.id)}
              style={{ ...toolBtn(), color: wireStyle === s.id ? 'var(--acc)' : 'var(--ink4)', borderColor: wireStyle === s.id ? 'var(--acc)' : 'var(--rule)' }}>
              {s.label}
            </button>
          ))}
        </div>

        <button onClick={rotateSelected} disabled={!selectedId} title="girar 90° (R)"
          style={{ ...toolBtn(), opacity: selectedId ? 1 : 0.5, cursor: selectedId ? 'pointer' : 'default' }}>girar ⟳</button>
        {view.scale !== 1 || view.tx || view.ty ? <button onClick={resetView} style={toolBtn()}>centralizar</button> : null}
        {hiddenCount > 0 && <button onClick={showAll} style={{ ...toolBtn(), color: 'var(--acc)' }}>mostrar escondidos ({hiddenCount})</button>}
        {pending && <button onClick={() => { setPending(null); setMouse(null) }} style={toolBtn()}>cancelar fio</button>}
        {selWire != null && <button onClick={() => { removeWire(selWire); setSelWire(null) }} style={{ ...toolBtn(), color: 'var(--err2)' }}>remover fio</button>}
        {entityIds.filter(id => id !== 'esp32' && !hidden[id] && !live?.wiring?.[id]?.wired).map(id => (
          <button key={id} onClick={() => autoWire(id)} style={toolBtn()}>auto {entities[id].def.label}</button>
        ))}
        {wires.length > 0 && <button onClick={clearAllWires} style={toolBtn()}>limpar fios</button>}
      </div>

      {/* schematic */}
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0, position: 'relative' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: '100%', height: '100%', display: 'block', cursor: action.current?.kind === 'pan' ? 'grabbing' : 'default' }}
          onMouseDown={startPan}
          onClick={() => { setSelWire(null); if (selectedId) selectEntity(null) }}
          onContextMenu={(e) => { if (pending) { e.preventDefault(); setPending(null); setMouse(null) } }}
        >
          <g transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}>
            {/* wires */}
            {wires.map((w, i) => {
              const a = effPin(w.from.comp, w.from.pin)
              const b = effPin(w.to.comp, w.to.pin)
              if (!a || !b) return null
              const faded = hidden[w.from.comp] || hidden[w.to.comp]
              const issue = issueByWire[i]
              const isSel = selWire === i
              const color = isSel ? WIRE_SEL
                : issue?.severity === 'error' ? WIRE_ERR
                : issue ? WIRE_WARN
                : wireColor(w)
              const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
              const labelW = issue ? Math.min(issue.title.length * 5.4 + 14, 300) : 0
              return (
                <g key={i} style={{ cursor: 'pointer', opacity: faded ? 0.15 : 1, pointerEvents: faded ? 'none' : 'auto' }}
                  onClick={(e) => { e.stopPropagation(); setPending(null); setSelWire(isSel ? null : i) }}>
                  <path d={wirePath(a, b, wireStyle)} fill="none" stroke={color}
                    strokeWidth={isSel ? 2.6 : issue?.severity === 'error' ? 2.4 : 2}
                    strokeLinejoin="round" strokeDasharray={issue ? '6 4' : 'none'} opacity={0.92} />
                  <path d={wirePath(a, b, wireStyle)} fill="none" stroke="transparent" strokeWidth={12} />
                  {issue && (
                    <g transform={`translate(${mx},${my - 8})`} style={{ pointerEvents: 'none' }}>
                      <rect x={-labelW / 2} y={-9} width={labelW} height={15} rx={3}
                        fill="var(--paper)" stroke={issue.severity === 'error' ? WIRE_ERR : WIRE_WARN} strokeWidth={1} />
                      <text textAnchor="middle" y={2.5} fontFamily="'Space Mono', monospace" fontSize={11}
                        fill={issue.severity === 'error' ? WIRE_ERR : WIRE_WARN}>{issue.title}</text>
                    </g>
                  )}
                </g>
              )
            })}

            {/* pending preview wire */}
            {pending && mouse && effPin(pending.comp, pending.pin) && (
              <path d={wirePath(effPin(pending.comp, pending.pin), mouse, wireStyle)}
                fill="none" stroke={WIRE_SEL} strokeWidth={1.6} strokeDasharray="4 3" opacity={0.6} />
            )}

            {/* component blocks */}
            {Object.entries(blocks).map(([id, b]) => {
              const def = entities[id].def
              const sel = selectedId === id
              const st = live?.wiring?.[id]
              const statusColor = id === 'esp32' ? '#3A9060' : st?.wired ? '#3A9060' : '#ADA69E'
              const d = drag[id] || { dx: 0, dy: 0 }
              const ec = blockCenter(id)
              const r = rot[id] || 0
              const faded = !!hidden[id]
              return (
                <g key={id} style={{ opacity: faded ? 0.15 : 1, pointerEvents: faded ? 'none' : 'auto' }}>
                  {/* the rectangle rotates around the (dragged) centre; pins are
                      drawn at JS-computed rotated coords so wires stay attached */}
                  <rect x={b.x + d.dx} y={b.y + d.dy} width={b.w} height={b.h} rx={8}
                    transform={r ? `rotate(${r} ${ec.x} ${ec.y})` : undefined}
                    fill={id === 'esp32' ? '#1F2E49' : 'var(--paper2)'}
                    stroke={sel ? WIRE_SEL : 'var(--rule)'} strokeWidth={sel ? 2 : 1}
                    style={{ cursor: 'grab' }}
                    onMouseDown={(e) => startCompDrag(id, e)}
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); const rr = svgRef.current.getBoundingClientRect(); setCtxMenu({ id, x: e.clientX - rr.left, y: e.clientY - rr.top }) }} />
                  <g transform={r ? `rotate(${r} ${ec.x} ${ec.y})` : undefined} style={{ pointerEvents: 'none' }}>
                    <circle cx={b.x + d.dx + 14} cy={b.y + d.dy + 15} r={4} fill={statusColor} />
                    <text x={b.x + d.dx + 26} y={b.y + d.dy + 18} fontFamily="'Space Grotesk', sans-serif" fontSize={14} fontWeight={600}
                      fill={id === 'esp32' ? 'rgba(255,255,255,.88)' : 'var(--ink)'}>{def.label}</text>
                    <text x={b.x + d.dx + 14} y={b.y + d.dy + 30} fontFamily="'Space Mono', monospace" fontSize={10} letterSpacing=".05em"
                      fill={id === 'esp32' ? 'rgba(255,255,255,.62)' : 'var(--ink4)'}>
                      {id === 'esp32' ? def.friendly || '' : st?.wired ? 'conectado' : 'não conectado'}
                    </text>
                  </g>

                  {/* labeled physical pins (drawn at effective, rotated coords) */}
                  {COMPONENT_PINS[id].filter(p => pinPos[`${id}.${p.id}`]).map((p) => {
                    const pos = effPin(id, p.id)
                    const isPending = pending && pending.comp === id && pending.pin === p.id
                    const connected = wires.some(w =>
                      (w.from.comp === id && w.from.pin === p.id) || (w.to.comp === id && w.to.pin === p.id))
                    const labelRight = pos.x >= ec.x          // label points away from the block centre
                    const labelX = labelRight ? pos.x + 10 : pos.x - 10
                    const inOnly = !!p.inputOnly
                    const isHover = hoverPin === `${id}.${p.id}`
                    const rc = roleColor(p.role)
                    return (
                      <g key={p.id} style={{ cursor: 'crosshair' }}
                        onClick={(e) => { e.stopPropagation(); clickPin(id, p.id, e.currentTarget) }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onMouseEnter={() => setHoverPin(`${id}.${p.id}`)}
                        onMouseLeave={() => setHoverPin(h => (h === `${id}.${p.id}` ? null : h))}>
                        {isPending && <circle cx={pos.x} cy={pos.y} r={9} fill="none" stroke={WIRE_SEL} strokeWidth={1.4} opacity={0.7} />}
                        {isHover && !isPending && <circle cx={pos.x} cy={pos.y} r={8.5} fill="none" stroke={WIRE_SEL} strokeWidth={1.2} opacity={0.45} />}
                        <circle cx={pos.x} cy={pos.y} r={isHover && !isPending ? 6.5 : 5.5}
                          fill={isPending ? WIRE_SEL : inOnly ? 'var(--paper4)' : connected ? rc : 'var(--paper3)'}
                          stroke={isPending ? '#2B5EA7' : inOnly ? 'var(--ink4)' : rc}
                          strokeWidth={1.4} strokeDasharray={inOnly ? '2 2' : 'none'} />
                        <text x={labelX} y={pos.y + 3.5} textAnchor={labelRight ? 'start' : 'end'}
                          fontFamily="'Space Mono', monospace" fontSize={12}
                          fill={inOnly ? (id === 'esp32' ? 'rgba(255,255,255,.60)' : 'var(--ink4)') : id === 'esp32' ? 'rgba(255,255,255,.72)' : 'var(--ink2)'}
                          style={{ pointerEvents: 'none' }}>{p.label || p.id}</text>
                        <title>{p.note || p.id}</title>
                      </g>
                    )
                  })}
                </g>
              )
            })}

            {/* legend */}
            <g transform={`translate(16,${height - 16})`} fontFamily="'Space Mono', monospace" fontSize={11} fill="var(--ink4)">
              <line x1={0} y1={-3} x2={18} y2={-3} stroke={ROLE_COLOR.power3v3} strokeWidth={2} /><text x={22} y={0}>energia</text>
              <line x1={78} y1={-3} x2={96} y2={-3} stroke={ROLE_COLOR.gnd} strokeWidth={2} /><text x={100} y={0}>terra</text>
              <line x1={146} y1={-3} x2={164} y2={-3} stroke={ROLE_COLOR.sda} strokeWidth={2} /><text x={168} y={0}>SDA</text>
              <line x1={210} y1={-3} x2={228} y2={-3} stroke={ROLE_COLOR.scl} strokeWidth={2} /><text x={232} y={0}>SCL</text>
              <line x1={274} y1={-3} x2={292} y2={-3} stroke={WIRE_ERR} strokeWidth={2} strokeDasharray="5 3" /><text x={296} y={0}>erro</text>
            </g>
          </g>
        </svg>

        {/* right-click context menu */}
        {ctxMenu && (
          <div style={{ position: 'absolute', left: ctxMenu.x, top: ctxMenu.y, zIndex: 5, background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 6, boxShadow: '0 4px 14px rgba(0,0,0,.18)', overflow: 'hidden', minWidth: 160 }}
            onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { selectEntity(ctxMenu.id); setRot(r => ({ ...r, [ctxMenu.id]: ((r[ctxMenu.id] || 0) + 90) % 360 })); setCtxMenu(null) }}
              style={ctxItem()}>girar 90°</button>
            <button onClick={() => hideComp(ctxMenu.id)} style={ctxItem()}>esconder componente</button>
          </div>
        )}
      </div>

      {/* live wiring feedback — explains every problem textually */}
      {wiringIssues.length > 0 && (
        <div style={{ flexShrink: 0, maxHeight: 130, overflowY: 'auto', borderTop: '1px solid var(--rule)', padding: '8px 12px', background: 'var(--paper2)' }}>
          {wiringIssues.slice(0, 4).map((iss, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 5 }}>
              <span style={{
                ...mono, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', flexShrink: 0, marginTop: 1,
                color: 'var(--btn-fg)', background: iss.severity === 'error' ? 'var(--err2)' : 'var(--warn2)', borderRadius: 2, padding: '1px 4px',
              }}>{SOURCE_LABEL[iss.source]}</span>
              <span style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 600, flexShrink: 0 }}>{iss.title}</span>
              <span style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.4 }}>{iss.detail}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function toolBtn() {
  return {
    padding: '3px 10px', borderRadius: 4, cursor: 'pointer',
    border: '1px solid var(--rule)', background: 'var(--paper2)',
    ...mono, fontSize: 11, letterSpacing: '.05em', color: 'var(--ink3)',
  }
}

function ctxItem() {
  return {
    display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px',
    border: 'none', borderBottom: '1px solid var(--rule)', background: 'var(--paper)',
    cursor: 'pointer', fontFamily: "'Space Grotesk', sans-serif", fontSize: 13.5, color: 'var(--ink)',
  }
}
