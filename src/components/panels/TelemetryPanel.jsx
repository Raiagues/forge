import useForge from '../../store/useForge'
import EmptyState from './EmptyState'

// Lightweight inline SVG sparkline — no chart lib, stays dependency-light.
function Sparkline({ data, color, unit, label, value, domain }) {
  const W = 520, H = 96, pad = 6
  const pts = data.filter(v => v != null)
  let path = '', area = ''
  if (pts.length > 1) {
    const min = domain ? domain[0] : Math.min(...pts)
    const max = domain ? domain[1] : Math.max(...pts)
    const span = max - min || 1
    const stepX = (W - pad * 2) / (pts.length - 1)
    const xy = pts.map((v, i) => {
      const x = pad + i * stepX
      const y = H - pad - ((v - min) / span) * (H - pad * 2)
      return [x, y]
    })
    path = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
    area = `${path} L${xy[xy.length - 1][0].toFixed(1)},${H - pad} L${xy[0][0].toFixed(1)},${H - pad} Z`
  }

  return (
    <div style={{ border: '1px solid var(--rule)', borderRadius: 6, background: 'var(--paper2)', padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink3)' }}>{label}</span>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 15, fontWeight: 700, color }}>
          {value != null ? value : '—'}<span style={{ fontSize: 12, color: 'var(--ink4)', marginLeft: 4 }}>{unit}</span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: 'block' }}>
        <defs>
          <linearGradient id={`g-${label}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map(p => (
          <line key={p} x1={pad} x2={W - pad} y1={H * p} y2={H * p} stroke="var(--rule2)" strokeWidth="1" />
        ))}
        {area && <path d={area} fill={`url(#g-${label})`} />}
        {path
          ? <path d={path} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
          : <text x={W / 2} y={H / 2} textAnchor="middle" fontFamily="'Space Mono', monospace" fontSize="13" fill="var(--ink4)">aguardando amostras…</text>}
      </svg>
    </div>
  )
}

export default function TelemetryPanel() {
  const { telemetry, entities, seq, hwLink } = useForge()
  // Only show telemetry when a real serial stream is active (ESP32 connected
  // through the Serial bridge). No real stream → show nothing, never simulated.
  if (!hwLink.connected) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 13.5, color: 'var(--ink4)', letterSpacing: '.06em' }}>
          aguardando dados do hardware
        </span>
      </div>
    )
  }

  const last = telemetry[telemetry.length - 1] || {}
  const col = (key) => telemetry.map(t => t[key])

  const charts = [
    entities.bmp280  && { label: 'Temperatura',  key: 'temp',  color: 'var(--err2)', unit: '°C',  domain: [15, 30] },
    entities.bmp280  && { label: 'Pressão',      key: 'press', color: 'var(--acc2)', unit: 'hPa', domain: [650, 720] },
    entities.mpu6050 && { label: 'Aceleração Z', key: 'accel', color: 'var(--warn2)',unit: 'g',   domain: [0.9, 1.1] },
    entities.esp32   && { label: 'Heap livre',   key: 'heap',  color: 'var(--ok2)',  unit: 'kB',  domain: [180, 260] },
  ].filter(Boolean)

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '18px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>Telemetria ao vivo</h2>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: 'var(--ink4)', letterSpacing: '.08em' }}>
          {telemetry.length} amostras · t+{seq * 3}s · 0.33 Hz
        </span>
        <span className="pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ok2)', alignSelf: 'center' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14, maxWidth: 1120 }}>
        {charts.map(c => (
          <Sparkline key={c.key} label={c.label} unit={c.unit} color={c.color} domain={c.domain}
            data={col(c.key)} value={last[c.key] ?? null} />
        ))}
      </div>

      {charts.length === 0 && (
        <div style={{ fontSize: 14, color: 'var(--ink3)', marginTop: 8 }}>
          Nenhum sensor com telemetria nesta missão.
        </div>
      )}
    </div>
  )
}
