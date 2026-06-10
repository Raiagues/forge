import { useMemo, useRef, useState } from 'react'
import useForge from '../../store/useForge'
import { COMPONENT_PINS, wireNet, SOURCE_LABEL } from '../../mission/index.js'
import { track } from '../../lib/analytics.js'

// ──────────────────────────────────────────────────────────────────
// SchematicView — 2D systems view of the same hardware graph as the
// 3D board, with prototyping-style manual pin wiring:
//   click a pin → click a destination pin → wire created
//   wrong connections stay visible in red, with the rule explained
//   click a wire to remove it
// Shares all state with the 3D view (entities, wires, validation).
// ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: "'Space Mono', monospace" }

const NET_COLOR = {
  power: '#C8831A',   // 3V3/VCC
  gnd:   '#3E3A34',
  i2c:   '#2B5EA7',
  other: '#7A736A',
}
const PIN_ROLE_COLOR = {
  power3v3: '#C8831A', vcc: '#C8831A', gnd: '#3E3A34',
  sda: '#2B5EA7', scl: '#2B5EA7', gpio: '#5A6B7A',
}

const PIN_SPACING = 24
const BLOCK_W = 168

// Deterministic schematic layout: ESP32 on the left, sensors stacked
// on the right. Returns block rects + absolute pin coordinates.
function layout(entityIds) {
  const blocks = {}
  const pinPos = {}
  const esp = entityIds.includes('esp32')
  const sensors = entityIds.filter(id => id !== 'esp32' && COMPONENT_PINS[id])

  if (esp) {
    const pins = COMPONENT_PINS.esp32
    const h = pins.length * PIN_SPACING + 46
    blocks.esp32 = { x: 70, y: 60, w: BLOCK_W, h }
    pins.forEach((p, i) => {
      pinPos[`esp32.${p.id}`] = { x: 70 + BLOCK_W, y: 60 + 38 + i * PIN_SPACING, side: 'right' }
    })
  }
  let y = 80
  for (const id of sensors) {
    const pins = COMPONENT_PINS[id]
    const h = pins.length * PIN_SPACING + 46
    blocks[id] = { x: 470, y, w: BLOCK_W, h }
    pins.forEach((p, i) => {
      pinPos[`${id}.${p.id}`] = { x: 470, y: y + 38 + i * PIN_SPACING, side: 'left' }
    })
    y += h + 36
  }
  const height = Math.max(esp ? blocks.esp32.y + blocks.esp32.h + 60 : 0, y + 20, 420)
  return { blocks, pinPos, width: 740, height }
}

function wirePath(a, b) {
  const dx = Math.max(46, Math.abs(b.x - a.x) * 0.4)
  const c1x = a.side === 'right' ? a.x + dx : a.x - dx
  const c2x = b.side === 'right' ? b.x + dx : b.x - dx
  return `M${a.x},${a.y} C${c1x},${a.y} ${c2x},${b.y} ${b.x},${b.y}`
}

export default function SchematicView() {
  const {
    entities, wires, addWire, removeWire, clearAllWires, autoWire,
    selectEntity, selectedId, live,
  } = useForge()
  const entityIds = Object.keys(entities)
  const { blocks, pinPos, width, height } = useMemo(() => layout(entityIds), [entityIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const [pending, setPending] = useState(null)   // { comp, pin }
  const [mouse, setMouse] = useState(null)
  const svgRef = useRef()

  const validation = live?.validation
  const wiringIssues = (validation?.issues || []).filter(i => i.source === 'wiring')
  const issueByWire = {}
  wiringIssues.forEach(i => { if (i.wireIndex != null) issueByWire[i.wireIndex] = i })

  const toSvg = (e) => {
    const r = svgRef.current?.getBoundingClientRect()
    if (!r) return null
    // viewBox is scaled to fit — map client coords back into viewBox space
    const sx = width / r.width, sy = height / r.height
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy }
  }

  const clickPin = (comp, pin) => {
    if (!pending) {
      track('pin_select', { target: `${comp}.${pin}` })
      setPending({ comp, pin })
    } else {
      addWire(pending, { comp, pin })
      setPending(null); setMouse(null)
    }
  }

  if (entityIds.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ ...mono, fontSize: 10, color: 'var(--ink4)' }}>placa vazia — adicione componentes na missão</span>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--paper)' }}>
      {/* toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', flexShrink: 0 }}>
        <span style={{ ...mono, fontSize: 9, color: 'var(--ink3)', letterSpacing: '.06em' }}>
          {pending
            ? `${pending.comp}.${pending.pin} → clique no pino de destino`
            : 'clique em um pino para iniciar um fio · clique em um fio para removê-lo'}
        </span>
        <div style={{ flex: 1 }} />
        {pending && (
          <button onClick={() => { setPending(null); setMouse(null) }} style={toolBtn()}>✕ cancelar fio</button>
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
          onClick={() => { /* background click keeps pending — explicit cancel only */ }}
        >
          {/* wires under blocks' pins but above bg */}
          {wires.map((w, i) => {
            const a = pinPos[`${w.from.comp}.${w.from.pin}`]
            const b = pinPos[`${w.to.comp}.${w.to.pin}`]
            if (!a || !b) return null
            const issue = issueByWire[i]
            const color = issue?.severity === 'error' ? '#C04030' : NET_COLOR[wireNet(w)]
            return (
              <g key={i} style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); removeWire(i) }}>
                <path d={wirePath(a, b)} fill="none" stroke={color} strokeWidth={issue?.severity === 'error' ? 2.4 : 1.8}
                  strokeDasharray={issue ? '6 4' : 'none'} opacity={0.85} />
                {/* invisible fat hit area */}
                <path d={wirePath(a, b)} fill="none" stroke="transparent" strokeWidth={10} />
                {issue?.severity === 'error' && (
                  <g transform={`translate(${(a.x + b.x) / 2},${(a.y + b.y) / 2})`}>
                    <circle r={8} fill="#C04030" />
                    <text y={3.5} textAnchor="middle" fontSize={10} fontWeight={700} fill="#F4EFE6">!</text>
                  </g>
                )}
              </g>
            )
          })}

          {/* pending preview wire */}
          {pending && mouse && pinPos[`${pending.comp}.${pending.pin}`] && (
            <path
              d={wirePath(pinPos[`${pending.comp}.${pending.pin}`], { ...mouse, side: 'left' })}
              fill="none" stroke="#4A7DD4" strokeWidth={1.6} strokeDasharray="4 3" opacity={0.6}
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
                  stroke={sel ? '#4A7DD4' : 'var(--rule)'} strokeWidth={sel ? 2 : 1}
                  style={{ cursor: 'pointer' }} onClick={() => selectEntity(id)} />
                <circle cx={b.x + 14} cy={b.y + 15} r={4} fill={statusColor} />
                <text x={b.x + 26} y={b.y + 18} fontFamily="'Space Grotesk', sans-serif" fontSize={12} fontWeight={600}
                  fill={id === 'esp32' ? 'rgba(255,255,255,.88)' : 'var(--ink)'} style={{ pointerEvents: 'none' }}>
                  {def.label}
                </text>
                <text x={b.x + 14} y={b.y + 30} fontFamily="'Space Mono', monospace" fontSize={7.5} letterSpacing=".05em"
                  fill={id === 'esp32' ? 'rgba(255,255,255,.4)' : 'var(--ink4)'} style={{ pointerEvents: 'none' }}>
                  {id === 'esp32' ? 'computador de bordo' : st?.wired ? `conectado · ${def.address || ''}` : 'não conectado'}
                </text>

                {/* pins */}
                {COMPONENT_PINS[id].map((p) => {
                  const pos = pinPos[`${id}.${p.id}`]
                  const isPending = pending && pending.comp === id && pending.pin === p.id
                  const connected = wires.some(w =>
                    (w.from.comp === id && w.from.pin === p.id) || (w.to.comp === id && w.to.pin === p.id))
                  const labelX = pos.side === 'right' ? pos.x - 10 : pos.x + 10
                  return (
                    <g key={p.id} style={{ cursor: 'crosshair' }}
                      onClick={(e) => { e.stopPropagation(); clickPin(id, p.id) }}>
                      <circle cx={pos.x} cy={pos.y} r={5.5}
                        fill={isPending ? '#4A7DD4' : connected ? (PIN_ROLE_COLOR[p.role] || '#5A6B7A') : 'var(--paper3)'}
                        stroke={isPending ? '#2B5EA7' : PIN_ROLE_COLOR[p.role] || 'var(--rule)'} strokeWidth={1.4} />
                      <text x={labelX} y={pos.y + 3.5}
                        textAnchor={pos.side === 'right' ? 'end' : 'start'}
                        fontFamily="'Space Mono', monospace" fontSize={9}
                        fill={id === 'esp32' ? 'rgba(255,255,255,.72)' : 'var(--ink2)'}
                        style={{ pointerEvents: 'none' }}>
                        {p.id}
                      </text>
                      {/* tooltip-ish role note via <title> */}
                      <title>{p.note || p.id}</title>
                    </g>
                  )
                })}
              </g>
            )
          })}

          {/* legend */}
          <g transform={`translate(16,${height - 16})`} fontFamily="'Space Mono', monospace" fontSize={8} fill="var(--ink4)">
            <line x1={0} y1={-3} x2={18} y2={-3} stroke={NET_COLOR.power} strokeWidth={2} /><text x={22} y={0}>3V3/VCC</text>
            <line x1={84} y1={-3} x2={102} y2={-3} stroke={NET_COLOR.gnd} strokeWidth={2} /><text x={106} y={0}>GND</text>
            <line x1={150} y1={-3} x2={168} y2={-3} stroke={NET_COLOR.i2c} strokeWidth={2} /><text x={172} y={0}>I²C</text>
            <line x1={210} y1={-3} x2={228} y2={-3} stroke="#C04030" strokeWidth={2} strokeDasharray="5 3" /><text x={232} y={0}>erro</text>
          </g>
        </svg>
      </div>

      {/* live wiring feedback — explains every problem textually */}
      {wiringIssues.length > 0 && (
        <div style={{ flexShrink: 0, maxHeight: 130, overflowY: 'auto', borderTop: '1px solid var(--rule)', padding: '8px 12px', background: 'var(--paper2)' }}>
          {wiringIssues.slice(0, 4).map((iss, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 5 }}>
              <span style={{
                ...mono, fontSize: 7, letterSpacing: '.08em', textTransform: 'uppercase', flexShrink: 0, marginTop: 1,
                color: '#fff', background: iss.severity === 'error' ? 'var(--err2)' : 'var(--warn2)', borderRadius: 2, padding: '1px 4px',
              }}>{SOURCE_LABEL[iss.source]}</span>
              <span style={{ fontSize: 11, color: 'var(--ink)', fontWeight: 600, flexShrink: 0 }}>{iss.title}</span>
              <span style={{ fontSize: 10.5, color: 'var(--ink3)', lineHeight: 1.4 }}>{iss.detail}</span>
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
    ...mono, fontSize: 8.5, letterSpacing: '.05em', color: 'var(--ink3)',
  }
}
