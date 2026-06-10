import useForge, { STATUS } from '../../store/useForge'
import EmptyState from './EmptyState'

const BUS_COLOR = { I2C: '#2B5EA7', SPI: '#2A6B4A', UART: '#963020', PWR: '#8A5A14', MCU: '#2B3F7A' }
const STATUS_COLOR = { [STATUS.OK]: '#3A9060', [STATUS.WARN]: '#C8831A', [STATUS.ERR]: '#C04030', [STATUS.SCANNING]: '#4A7DD4', [STATUS.IDLE]: '#7A736A' }

export default function ArchitecturePanel() {
  const { entities, selectedId, selectEntity } = useForge()
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

  // budgets
  const totalCurrent = list.reduce((s, e) => s + (e.def.current || 0), 0)
  const totalMass = list.reduce((s, e) => s + (e.def.mass || 0), 0)
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
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 6 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>Arquitetura do sistema</h2>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: 'var(--ink4)' }}>diagrama de blocos · clique para inspecionar</span>
      </div>

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
