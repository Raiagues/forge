import useForge from '../../store/useForge'
import { COMPONENT_PINS, wireNet } from '../../mission/index.js'
import EmptyState from '../panels/EmptyState'

// ──────────────────────────────────────────────────────────────────
// BreadboardView — a Fritzing-style protoboard visualisation of the
// SAME hardware graph. Components are drawn as modules plugged into a
// breadboard; the real store wires are drawn as colour-coded jumper
// cables (net colours, with a slack droop like physical jumpers) so a
// beginner can see how the connections would physically run. Read-only
// (wiring is edited in the schematic / 3D views); shares all state.
// ──────────────────────────────────────────────────────────────────

const mono = "'Space Mono', monospace"
const HOLE = '#B8AE99'

// jumper colour by electrical net — the convention students learn
const NET_COLOR = { power: '#C0392B', gnd: '#23211C', i2c: '#2B5EA7', uart: '#E08A2A', other: '#2E7A4F' }
const NET_LABEL = { power: 'alimentação', gnd: 'terra', i2c: 'I²C', uart: 'UART', other: 'sinal' }

const ESP_X = 70, ESP_W = 188, PITCH = 26, SENSOR_X = 470, SENSOR_W = 196

// lay components out and record every pin's hole position
function layout(entityIds) {
  const blocks = {}, holes = {}
  const espPins = COMPONENT_PINS.esp32 || []
  if (entityIds.includes('esp32')) {
    const left = espPins.filter(p => p.side === 'L')
    const right = espPins.filter(p => p.side === 'R')
    const rows = Math.max(left.length, right.length)
    const h = rows * PITCH + 52, y = 56
    blocks.esp32 = { x: ESP_X, y, w: ESP_W, h, kind: 'mcu' }
    left.forEach((p, i) => { holes[`esp32.${p.id}`] = { x: ESP_X + 18, y: y + 40 + i * PITCH, side: 'left' } })
    right.forEach((p, i) => { holes[`esp32.${p.id}`] = { x: ESP_X + ESP_W - 18, y: y + 40 + i * PITCH, side: 'right' } })
  }
  let y = 66
  for (const id of entityIds.filter(i => i !== 'esp32' && COMPONENT_PINS[i])) {
    const pins = COMPONENT_PINS[id]
    const h = pins.length * PITCH + 50
    blocks[id] = { x: SENSOR_X, y, w: SENSOR_W, h, kind: 'sensor' }
    pins.forEach((p, i) => { holes[`${id}.${p.id}`] = { x: SENSOR_X + 18, y: y + 40 + i * PITCH, side: 'left' } })
    y += h + 28
  }
  const height = Math.max(blocks.esp32 ? blocks.esp32.y + blocks.esp32.h + 50 : 0, y + 10, 420)
  return { blocks, holes, width: 760, height }
}

// slack-jumper Bézier between two holes (droops downward like a real wire)
function jumper(a, b) {
  const sag = 26 + Math.abs(b.y - a.y) * 0.12
  const x1 = a.side === 'right' ? a.x + 24 : a.x - 24
  const x2 = b.side === 'right' ? b.x + 24 : b.x - 24
  const my = (a.y + b.y) / 2 + sag
  return `M ${a.x} ${a.y} C ${x1} ${a.y + sag * 0.4} ${(a.x + b.x) / 2} ${my} ${(a.x + b.x) / 2} ${my} S ${x2} ${b.y + sag * 0.4} ${b.x} ${b.y}`
}

function Hole({ x, y }) {
  return <circle cx={x} cy={y} r={4.2} fill="#15130F" stroke={HOLE} strokeWidth={1.4} />
}

export default function BreadboardView() {
  const { entities, wires } = useForge()
  const entityIds = Object.keys(entities)
  if (entityIds.length === 0) return <EmptyState section="Protoboard" />

  const { blocks, holes, width, height } = layout(entityIds)
  // breadboard backdrop hole grid
  const cols = Math.floor((width - 24) / 18)
  const gridRows = Math.floor((height - 24) / 18)
  const usedNets = [...new Set(wires.map(wireNet))]

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--paper)' }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', borderBottom: '1px solid var(--rule)' }}>
        <span style={{ fontFamily: mono, fontSize: 12, color: 'var(--ink3)', letterSpacing: '.04em' }}>
          Protoboard · jumpers seguem a fiação real · edite na vista esquema/3D
        </span>
        <div style={{ flex: 1 }} />
        {usedNets.map(n => (
          <span key={n} style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: mono, fontSize: 11, color: 'var(--ink4)' }}>
            <span style={{ width: 12, height: 3, borderRadius: 2, background: NET_COLOR[n] }} />{NET_LABEL[n]}
          </span>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', minHeight: 0, padding: 12 }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '100%', display: 'block' }}>
          {/* breadboard body */}
          <rect x={6} y={6} width={width - 12} height={height - 12} rx={12} fill="#EFE7D2" stroke="#D6C9A8" strokeWidth={1.5} />
          {/* power rails */}
          <line x1={20} y1={20} x2={width - 20} y2={20} stroke="#C0392B" strokeWidth={1.4} opacity={0.7} />
          <line x1={20} y1={28} x2={width - 20} y2={28} stroke="#2B5EA7" strokeWidth={1.4} opacity={0.6} />
          <line x1={20} y1={height - 28} x2={width - 20} y2={height - 28} stroke="#C0392B" strokeWidth={1.4} opacity={0.7} />
          <line x1={20} y1={height - 20} x2={width - 20} y2={height - 20} stroke="#2B5EA7" strokeWidth={1.4} opacity={0.6} />
          {/* faint hole grid (decorative breadboard texture) */}
          <g opacity={0.35}>
            {Array.from({ length: gridRows }, (_, r) => Array.from({ length: cols }, (_, c) => (
              <circle key={`${r}-${c}`} cx={16 + c * 18} cy={40 + r * 18} r={1.6} fill="#C2B698" />
            )))}
          </g>

          {/* jumper cables = real wires, coloured by net */}
          {wires.map((w, i) => {
            const a = holes[`${w.from.comp}.${w.from.pin}`]
            const b = holes[`${w.to.comp}.${w.to.pin}`]
            if (!a || !b) return null
            const color = NET_COLOR[wireNet(w)] || NET_COLOR.other
            return (
              <g key={i}>
                <path d={jumper(a, b)} fill="none" stroke={color} strokeWidth={3.4} strokeLinecap="round" opacity={0.92} />
                <circle cx={a.x} cy={a.y} r={3.4} fill={color} />
                <circle cx={b.x} cy={b.y} r={3.4} fill={color} />
              </g>
            )
          })}

          {/* component modules */}
          {Object.entries(blocks).map(([id, blk]) => {
            const def = entities[id].def
            const isMcu = blk.kind === 'mcu'
            return (
              <g key={id}>
                <rect x={blk.x} y={blk.y} width={blk.w} height={blk.h} rx={8}
                  fill={isMcu ? '#1F2E49' : '#23402B'} stroke={isMcu ? '#33476B' : '#345C3C'} strokeWidth={1.4} />
                <text x={blk.x + blk.w / 2} y={blk.y + 22} textAnchor="middle"
                  fontFamily="'Space Grotesk', sans-serif" fontSize={14} fontWeight={600} fill="rgba(255,255,255,.92)">
                  {def.label}
                </text>
                <text x={blk.x + blk.w / 2} y={blk.y + 37} textAnchor="middle"
                  fontFamily={mono} fontSize={10} fill="rgba(255,255,255,.7)">{def.friendly}</text>
                {COMPONENT_PINS[id].map((p) => {
                  const hole = holes[`${id}.${p.id}`]
                  if (!hole) return null
                  const labelX = hole.side === 'right' ? hole.x - 12 : hole.x + 12
                  return (
                    <g key={p.id}>
                      <Hole x={hole.x} y={hole.y} />
                      <text x={labelX} y={hole.y + 3.5} textAnchor={hole.side === 'right' ? 'end' : 'start'}
                        fontFamily={mono} fontSize={11} fill="rgba(255,255,255,.78)">{p.label || p.id}</text>
                    </g>
                  )
                })}
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
