import { useEffect, useMemo, useRef, useState } from 'react'
import useForge from '../../store/useForge'
import { COMPONENT_PINS, SOURCE_LABEL } from '../../mission/index.js'
import { track } from '../../lib/analytics.js'

// ──────────────────────────────────────────────────────────────────
// SchematicView — 2D systems view of the same hardware graph as the
// 3D board, with prototyping-style manual pin wiring:
//   click a pin → it becomes selected → click a destination pin → wire
//   valid wires render neutral; invalid wires render red with the
//   violated rule written on the wire itself
//   Esc cancels an in-progress wire · click a wire to select it ·
//   Delete/Backspace removes the selected wire
// Shares all state with the 3D view (entities, wires, validation).
// ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: "'Space Mono', monospace" }

// wire palette: neutral when valid, semantic only for problems/selection
const WIRE_OK = '#8A8378'
const WIRE_ERR = '#C04030'
const WIRE_WARN = '#C8831A'
const WIRE_SEL = '#4A7DD4'

const PIN_ROLE_COLOR = {
  power3v3: '#C8831A', vcc: '#C8831A', gnd: '#3E3A34',
  sda: '#2B5EA7', scl: '#2B5EA7', gpio: '#5A6B7A',
  csb: '#7A736A', sdo: '#7A736A',
  uart_tx: '#963020', uart_rx: '#963020',
}

const PIN_SPACING = 28
const ESP_W = 216
const SENSOR_W = 180

// ESP32 pins split across both sides of the chip drawing, mirroring the
// physical devkit columns (from the pin catalog, not hardcoded here).
// The physical LEFT column (3V3/GND/I²C) faces the sensors → drawing right.
const ESP_RIGHT = COMPONENT_PINS.esp32.filter(p => p.side === 'L').map(p => p.id)
const ESP_LEFT = COMPONENT_PINS.esp32.filter(p => p.side === 'R').map(p => p.id)

// Deterministic schematic layout: ESP32 on the left (pins on both
// sides), sensors stacked on the right (pins on their left edge).
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

// ── orthogonal routing ─────────────────────────────────────────────
// Schematic auto-layout choice: a lightweight layered (Sugiyama-style)
// arrangement — ESP32 is the source layer on the left, sensors the next
// layer on the right — wired with ORTHOGONAL traces (horizontal/vertical
// only) routed through a dedicated vertical CHANNEL per wire in the gap
// between the columns. Per-wire channels keep vertical runs from
// overlapping each other; horizontal runs leave on each pin's own row, so
// the result reads like a real schematic instead of a tangle of curves.
// (Force-directed was rejected: it produces diagonal, non-deterministic
// layouts unsuited to circuit reading; full Sugiyama is overkill for a
// two-layer MCU-and-peripherals graph.)
const ESP_RIGHT_X = 96 + ESP_W   // ESP right edge (pins facing the sensors)
const SENSOR_X = 540             // sensor left edge

// route a → b through an explicit vertical channel x (cx)
function orthPath(a, b, cx) {
  const c = cx ?? (a.x + b.x) / 2
  return `M ${a.x} ${a.y} L ${c} ${a.y} L ${c} ${b.y} L ${b.x} ${b.y}`
}

// assign each wire its own channel x in the gap between the columns,
// ordered by mid-height so adjacent wires nest instead of crossing
function assignChannels(wires, pinPos) {
  const lo = ESP_RIGHT_X + 10, hi = SENSOR_X - 10
  const rows = wires.map((w, i) => {
    const a = pinPos[`${w.from.comp}.${w.from.pin}`]
    const b = pinPos[`${w.to.comp}.${w.to.pin}`]
    return { i, mid: a && b ? (a.y + b.y) / 2 : 0 }
  }).sort((p, q) => p.mid - q.mid)
  const step = (hi - lo) / (rows.length + 1)
  const cx = {}
  rows.forEach((r, k) => { cx[r.i] = lo + (k + 1) * step })
  return cx
}

export default function SchematicView() {
  const {
    entities, wires, addWire, removeWire, clearAllWires, autoWire,
    selectEntity, selectedId, live,
  } = useForge()
  const entityIds = Object.keys(entities)
  const { blocks, pinPos, width, height } = useMemo(() => layout(entityIds), [entityIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const channels = useMemo(() => assignChannels(wires, pinPos), [wires, pinPos])
  const [pending, setPending] = useState(null)     // selected origin pin { comp, pin }
  const [selWire, setSelWire] = useState(null)     // selected wire index
  const [mouse, setMouse] = useState(null)
  const [hoverPin, setHoverPin] = useState(null)   // pin under the cursor (connectable affordance)
  const svgRef = useRef()

  const validation = live?.validation
  const wiringIssues = (validation?.issues || []).filter(i => i.source === 'wiring')
  const issueByWire = {}
  wiringIssues.forEach(i => { if (i.wireIndex != null && !issueByWire[i.wireIndex]) issueByWire[i.wireIndex] = i })

  // keyboard: Esc cancels wiring/deselects · Delete removes selected wire
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'Escape') {
        setPending(null); setMouse(null); setSelWire(null)
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selWire != null) {
        e.preventDefault()
        removeWire(selWire)
        setSelWire(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selWire, removeWire])

  // wires get re-indexed after a removal — drop stale selection
  useEffect(() => { if (selWire != null && selWire >= wires.length) setSelWire(null) }, [wires.length, selWire])

  const toSvg = (e) => {
    const r = svgRef.current?.getBoundingClientRect()
    if (!r) return null
    // viewBox is scaled to fit — map client coords back into viewBox space
    const sx = width / r.width, sy = height / r.height
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy }
  }

  const clickPin = (comp, pin, anchorEl) => {
    setSelWire(null)
    if (!pending) {
      track('pin_select', { target: `${comp}.${pin}` })
      setPending({ comp, pin })
    } else if (pending.comp === comp && pending.pin === pin) {
      setPending(null); setMouse(null)   // clicking the same pin deselects it
    } else {
      // anchor any validation popover to the destination pin
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

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--paper)' }}>
      {/* toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', flexShrink: 0 }}>
        <span style={{ ...mono, fontSize: 12, color: 'var(--ink3)', letterSpacing: '.06em' }}>
          {pending
            ? `${pending.comp}.${pending.pin} selecionado → clique no pino de destino · Esc ou botão direito cancela`
            : selWire != null
              ? 'fio selecionado · Delete remove · Esc desmarca'
              : 'clique em um pino para iniciar um fio · clique em um fio para selecioná-lo'}
        </span>
        <div style={{ flex: 1 }} />
        {pending && (
          <button onClick={() => { setPending(null); setMouse(null) }} style={toolBtn()}>cancelar fio (Esc)</button>
        )}
        {selWire != null && (
          <button onClick={() => { removeWire(selWire); setSelWire(null) }} style={{ ...toolBtn(), color: 'var(--err2)' }}>remover fio (Del)</button>
        )}
        {entityIds.filter(id => id !== 'esp32' && !live?.wiring?.[id]?.wired).map(id => (
          <button key={id} onClick={() => autoWire(id)} style={toolBtn()}>auto-conectar {entities[id].def.label}</button>
        ))}
        {wires.length > 0 && <button onClick={clearAllWires} style={toolBtn()}>limpar fios</button>}
      </div>

      {/* schematic */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: '100%', height: '100%', display: 'block' }}
          onMouseMove={(e) => { if (pending) setMouse(toSvg(e)) }}
          onClick={() => { setSelWire(null); if (selectedId) selectEntity(null) }}
          onContextMenu={(e) => { if (pending) { e.preventDefault(); setPending(null); setMouse(null) } }}
        >
          {/* wires */}
          {wires.map((w, i) => {
            const a = pinPos[`${w.from.comp}.${w.from.pin}`]
            const b = pinPos[`${w.to.comp}.${w.to.pin}`]
            if (!a || !b) return null
            const issue = issueByWire[i]
            const isSel = selWire === i
            const color = isSel ? WIRE_SEL
              : issue?.severity === 'error' ? WIRE_ERR
              : issue ? WIRE_WARN
              : WIRE_OK
            const cx = channels[i]
            const mx = cx ?? (a.x + b.x) / 2, my = (a.y + b.y) / 2
            const labelW = issue ? Math.min(issue.title.length * 5.4 + 14, 300) : 0
            return (
              <g key={i} style={{ cursor: 'pointer' }}
                onClick={(e) => { e.stopPropagation(); setPending(null); setSelWire(isSel ? null : i) }}>
                <path d={orthPath(a, b, cx)} fill="none" stroke={color}
                  strokeWidth={isSel ? 2.6 : issue?.severity === 'error' ? 2.4 : 1.8}
                  strokeLinejoin="round" strokeDasharray={issue ? '6 4' : 'none'} opacity={0.9} />
                {/* invisible fat hit area */}
                <path d={orthPath(a, b, cx)} fill="none" stroke="transparent" strokeWidth={12} />
                {/* the violated rule, written on the wire itself */}
                {issue && (
                  <g transform={`translate(${mx},${my - 8})`} style={{ pointerEvents: 'none' }}>
                    <rect x={-labelW / 2} y={-9} width={labelW} height={15} rx={3}
                      fill="var(--paper)" stroke={issue.severity === 'error' ? WIRE_ERR : WIRE_WARN} strokeWidth={1} />
                    <text textAnchor="middle" y={2.5} fontFamily="'Space Mono', monospace" fontSize={11}
                      fill={issue.severity === 'error' ? WIRE_ERR : WIRE_WARN}>
                      {issue.title}
                    </text>
                  </g>
                )}
              </g>
            )
          })}

          {/* pending preview wire */}
          {pending && mouse && pinPos[`${pending.comp}.${pending.pin}`] && (
            <path
              d={orthPath(pinPos[`${pending.comp}.${pending.pin}`], { ...mouse, side: 'left' })}
              fill="none" stroke={WIRE_SEL} strokeWidth={1.6} strokeDasharray="4 3" opacity={0.6}
            />
          )}

          {/* component blocks */}
          {Object.entries(blocks).map(([id, b]) => {
            const def = entities[id].def
            const sel = selectedId === id
            const st = live?.wiring?.[id]
            const statusColor = id === 'esp32' ? '#3A9060' : st?.wired ? '#3A9060' : '#ADA69E'
            return (
              <g key={id}>
                <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={8}
                  fill={id === 'esp32' ? '#1F2E49' : 'var(--paper2)'}
                  stroke={sel ? WIRE_SEL : 'var(--rule)'} strokeWidth={sel ? 2 : 1}
                  style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); selectEntity(id) }} />
                <circle cx={b.x + 14} cy={b.y + 15} r={4} fill={statusColor} />
                <text x={b.x + 26} y={b.y + 18} fontFamily="'Space Grotesk', sans-serif" fontSize={14} fontWeight={600}
                  fill={id === 'esp32' ? 'rgba(255,255,255,.88)' : 'var(--ink)'} style={{ pointerEvents: 'none' }}>
                  {def.label}
                </text>
                <text x={b.x + 14} y={b.y + 30} fontFamily="'Space Mono', monospace" fontSize={10} letterSpacing=".05em"
                  fill={id === 'esp32' ? 'rgba(255,255,255,.62)' : 'var(--ink4)'} style={{ pointerEvents: 'none' }}>
                  {id === 'esp32' ? def.friendly || '' : st?.wired ? 'conectado' : 'não conectado'}
                </text>

                {/* labeled physical pins on the component drawing */}
                {COMPONENT_PINS[id].filter(p => pinPos[`${id}.${p.id}`]).map((p) => {
                  const pos = pinPos[`${id}.${p.id}`]
                  const isPending = pending && pending.comp === id && pending.pin === p.id
                  const connected = wires.some(w =>
                    (w.from.comp === id && w.from.pin === p.id) || (w.to.comp === id && w.to.pin === p.id))
                  const labelX = pos.side === 'right' ? pos.x - 10 : pos.x + 10
                  // input-only pins: gray, no output dot — visivelmente sem driver de saída
                  const inOnly = !!p.inputOnly
                  const isHover = hoverPin === `${id}.${p.id}`
                  return (
                    <g key={p.id} style={{ cursor: 'crosshair' }}
                      onClick={(e) => { e.stopPropagation(); clickPin(id, p.id, e.currentTarget) }}
                      onMouseEnter={() => setHoverPin(`${id}.${p.id}`)}
                      onMouseLeave={() => setHoverPin(h => (h === `${id}.${p.id}` ? null : h))}>
                      {isPending && <circle cx={pos.x} cy={pos.y} r={9} fill="none" stroke={WIRE_SEL} strokeWidth={1.4} opacity={0.7} />}
                      {isHover && !isPending && <circle cx={pos.x} cy={pos.y} r={8.5} fill="none" stroke={WIRE_SEL} strokeWidth={1.2} opacity={0.45} />}
                      <circle cx={pos.x} cy={pos.y} r={isHover && !isPending ? 6.5 : 5.5}
                        fill={isPending ? WIRE_SEL : inOnly ? 'var(--paper4)' : connected ? (PIN_ROLE_COLOR[p.role] || '#5A6B7A') : 'var(--paper3)'}
                        stroke={isPending ? '#2B5EA7' : inOnly ? 'var(--ink4)' : PIN_ROLE_COLOR[p.role] || 'var(--rule)'}
                        strokeWidth={1.4} strokeDasharray={inOnly ? '2 2' : 'none'} />
                      <text x={labelX} y={pos.y + 3.5}
                        textAnchor={pos.side === 'right' ? 'end' : 'start'}
                        fontFamily="'Space Mono', monospace" fontSize={12}
                        fill={inOnly ? (id === 'esp32' ? 'rgba(255,255,255,.60)' : 'var(--ink4)') : id === 'esp32' ? 'rgba(255,255,255,.72)' : 'var(--ink2)'}
                        style={{ pointerEvents: 'none' }}>
                        {p.label || p.id}
                      </text>
                      <title>{p.note || p.id}</title>
                    </g>
                  )
                })}
              </g>
            )
          })}

          {/* legend */}
          <g transform={`translate(16,${height - 16})`} fontFamily="'Space Mono', monospace" fontSize={11} fill="var(--ink4)">
            <line x1={0} y1={-3} x2={18} y2={-3} stroke={WIRE_OK} strokeWidth={2} /><text x={22} y={0}>conexão ok</text>
            <line x1={92} y1={-3} x2={110} y2={-3} stroke={WIRE_WARN} strokeWidth={2} strokeDasharray="5 3" /><text x={114} y={0}>aviso</text>
            <line x1={158} y1={-3} x2={176} y2={-3} stroke={WIRE_ERR} strokeWidth={2} strokeDasharray="5 3" /><text x={180} y={0}>erro</text>
            <line x1={216} y1={-3} x2={234} y2={-3} stroke={WIRE_SEL} strokeWidth={2} /><text x={238} y={0}>selecionado</text>
          </g>
        </svg>
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
