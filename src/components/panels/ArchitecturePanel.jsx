import { useState } from 'react'
import useForge, { STATUS, COMPONENT_DEFS } from '../../store/useForge'
import { SOFTWARE_LAYERS, activeModules } from '../../mission/index.js'
import EmptyState from './EmptyState'

const BUS_COLOR = { I2C: '#2B5EA7', SPI: '#2A6B4A', UART: '#963020', PWR: '#8A5A14', MCU: '#2B3F7A' }
const STATUS_COLOR = { [STATUS.OK]: '#3A9060', [STATUS.WARN]: '#C8831A', [STATUS.ERR]: '#C04030', [STATUS.SCANNING]: '#4A7DD4', [STATUS.IDLE]: '#7A736A' }
const mono = { fontFamily: "'Space Mono', monospace" }

// ── software architecture: modular blocks grouped by layer ────────
// Core (rarely touched) · Adaptive (reusable base) · Mission (custom).
function SoftwareArchitecture() {
  const { entities, missionPlan, openModuleInFirmware } = useForge()
  const mods = activeModules({
    defs: COMPONENT_DEFS,
    componentIds: Object.keys(entities),
    objectiveId: missionPlan.objectiveId,
  })

  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {SOFTWARE_LAYERS.map(layer => {
        const layerMods = mods.filter(m => m.layer === layer.id)
        return (
          <div key={layer.id} style={{
            flex: '1 1 220px', minWidth: 220, border: '1px solid var(--rule)', borderRadius: 8,
            background: 'var(--paper2)', overflow: 'hidden',
          }}>
            <div style={{ padding: '9px 12px', borderBottom: '1px solid var(--rule)', borderTop: `2px solid ${layer.color}` }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{layer.label}</div>
              <div style={{ fontSize: 10, color: 'var(--ink3)', lineHeight: 1.45, marginTop: 2 }}>{layer.desc}</div>
            </div>
            <div style={{ padding: '8px 10px' }}>
              {layerMods.length === 0 && (
                <div style={{ ...mono, fontSize: 9, color: 'var(--ink4)', padding: '6px 2px' }}>
                  nenhum módulo ativo nesta camada
                </div>
              )}
              {layerMods.map(m => (
                <button key={m.id} onClick={() => openModuleInFirmware(m.id)} style={{
                  display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                  border: '1px solid var(--rule)', borderLeft: `3px solid ${layer.color}`,
                  background: 'var(--paper)', borderRadius: 5, padding: '8px 10px', marginBottom: 6,
                  transition: 'all .14s',
                }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--paper3)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--paper)'}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink)' }}>{m.label}</span>
                    <span style={{ ...mono, fontSize: 8, color: 'var(--ink4)', marginLeft: 'auto' }}>{m.file}</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--ink3)', lineHeight: 1.45, marginTop: 3 }}>{m.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function ArchitecturePanel() {
  const { entities, selectedId, selectEntity, live } = useForge()
  const [view, setView] = useState('hardware')
  const list = Object.values(entities)
  if (list.length === 0) return <EmptyState section="Architecture" />

  const W = 760, H = 460, cx = W / 2, cy = H / 2
  const peripherals = list.filter(e => e.id !== 'esp32')
  const hub = entities.esp32

  // radial layout around the MCU hub
  const nodes = peripherals.map((e, i) => {
    const ang = (i / peripherals.length) * Math.PI * 2 - Math.PI / 2
    return { e, x: cx + Math.cos(ang) * 250, y: cy + Math.sin(ang) * 165 }
  })

  // budgets — override-aware totals from the live economics
  const totalCurrent = live?.eco?.currentmA ?? list.reduce((s, e) => s + (e.def.current || 0), 0)
  const totalMass = live?.eco?.massG ?? list.reduce((s, e) => s + (e.def.mass || 0), 0)
  const cap = entities.lipo_2000?.def.capacity || 0
  const hours = totalCurrent > 0 && cap ? (cap / totalCurrent).toFixed(1) : '—'

  const busesUsed = [...new Set(peripherals.map(e => e.def.protocol).filter(Boolean))]

  const Node = ({ x, y, e, hub: isHub }) => {
    const sel = selectedId === e.id
    const w = isHub ? 150 : 128, h = isHub ? 60 : 50
    return (
      <g transform={`translate(${x - w / 2},${y - h / 2})`} style={{ cursor: 'pointer' }} onClick={() => selectEntity(e.id)}>
        <rect width={w} height={h} rx={7}
          fill={isHub ? '#1F2E49' : 'var(--paper2)'}
          stroke={sel ? '#4A7DD4' : isHub ? '#2B3F7A' : 'var(--rule)'}
          strokeWidth={sel ? 2 : 1} />
        <circle cx={14} cy={14} r={4} fill={STATUS_COLOR[e.status]} />
        <text x={w / 2} y={h / 2 + 1} textAnchor="middle"
          fontFamily="'Space Grotesk', sans-serif" fontSize="12" fontWeight="600"
          fill={isHub ? 'rgba(255,255,255,.9)' : 'var(--ink)'}>{e.def.label}</text>
        <text x={w / 2} y={h - 10} textAnchor="middle"
          fontFamily="'Space Mono', monospace" fontSize="8" letterSpacing=".06em"
          fill={isHub ? 'rgba(255,255,255,.45)' : 'var(--ink4)'}>
          {e.def.protocol}{e.def.address ? ` · ${e.def.address}` : ''}
        </text>
      </g>
    )
  }

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '16px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>Arquitetura do sistema</h2>
        <span style={{ ...mono, fontSize: 9, color: 'var(--ink4)' }}>
          {view === 'hardware' ? 'diagrama de blocos · clique para inspecionar' : 'módulos de firmware · clique para abrir o código'}
        </span>
        <div style={{ flex: 1 }} />
        {['hardware', 'software'].map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
            ...mono, fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase',
            border: '1px solid var(--rule)',
            background: view === v ? 'var(--navy)' : 'var(--paper2)',
            color: view === v ? 'rgba(255,255,255,.8)' : 'var(--ink3)',
          }}>{v}</button>
        ))}
      </div>

      {view === 'software' && <SoftwareArchitecture />}

      {view === 'hardware' && (
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, border: '1px solid var(--rule)', borderRadius: 8, background: 'var(--paper2)' }}>
          {nodes.map(({ e, x, y }) => {
            const bus = e.def.protocol || 'PWR'
            const c = BUS_COLOR[bus] || '#7A736A'
            return (
              <g key={`l-${e.id}`}>
                <line x1={cx} y1={cy} x2={x} y2={y} stroke={c} strokeWidth={2}
                  strokeDasharray={bus === 'PWR' ? '5 4' : '0'} opacity={e.status === STATUS.ERR ? 0.95 : 0.5} />
                <text x={(cx + x) / 2} y={(cy + y) / 2 - 4} textAnchor="middle"
                  fontFamily="'Space Mono', monospace" fontSize="8" fill={c}>{bus}</text>
              </g>
            )
          })}
          {nodes.map(({ e, x, y }) => <Node key={e.id} e={e} x={x} y={y} />)}
          {hub && <Node e={hub} x={cx} y={cy} hub />}
        </svg>

        {/* budget + buses */}
        <div style={{ minWidth: 230, flex: 1 }}>
          <Card title="Orçamento elétrico">
            <Row k="Corrente total" v={`${totalCurrent.toFixed(0)} mA`} />
            <Row k="Capacidade" v={cap ? `${cap} mAh` : '—'} />
            <Row k="Autonomia est." v={`${hours} h`} accent />
          </Card>
          <Card title="Massa">
            <Row k="Massa total" v={`${totalMass} g`} />
            <Row k="Componentes" v={`${list.length}`} />
          </Card>
          <Card title="Barramentos">
            {busesUsed.map(b => (
              <Row key={b} k={b} v={`${peripherals.filter(e => e.def.protocol === b).length} dev`}
                dot={BUS_COLOR[b]} />
            ))}
          </Card>
        </div>
      </div>
      )}
    </div>
  )
}

function Card({ title, children }) {
  return (
    <div style={{ border: '1px solid var(--rule)', borderRadius: 7, background: 'var(--paper2)', padding: '10px 12px', marginBottom: 12 }}>
      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  )
}
function Row({ k, v, accent, dot }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--rule2)' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink3)' }}>
        {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot }} />}{k}
      </span>
      <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: accent ? 'var(--acc)' : 'var(--ink)' }}>{v}</span>
    </div>
  )
}
