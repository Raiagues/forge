import { useEffect, useRef, useState } from 'react'
import useForge from '../../store/useForge'
import { track } from '../../lib/analytics.js'

// ──────────────────────────────────────────────────────────────────
// TelemetryPanel — ground station view ("estação terrestre").
//
// DESIGN RATIONALE
// · Metaphor: a miniature mission control monitor, not a dashboard.
//   Density/seriousness referenced from GMAT and NASA Eyes (thin
//   panels, mono labels, everything annotated); the visual treatment
//   stays in the FORGE poster direction (flat JPL-poster planet,
//   cream-on-navy, gold accents) rather than photoreal WebGL.
// · Layout: command console on the LEFT (the operator's hand), the
//   orbit viewport in the CENTER (the operator's eyes), telemetry
//   readout on the RIGHT (the numbers) — the classic console-monitor-
//   strip arrangement of real ground station software.
// · The satellite is a continuous SVG animateMotion along a visible
//   elliptical orbit. Commands fire an uplink pulse from the ground
//   station marker toward the orbit; telemetry answers with a downlink
//   pulse in reverse. Subtle, non-blocking, purely presentational.
// · HONESTY: with no real ESP32 link everything is clearly tagged
//   "DADOS SIMULADOS"; commands are explicit placeholders. A real
//   hwLink switches the tag — same surfaces, no fake-positive state.
//
// THEMING: this is a poster surface, so every colour is a --poster-*
// token (cream-on-navy in dark, ink-on-paper in light). SVG presentation
// attributes don't resolve var() in Chrome/Safari, so the SVG ink is
// driven by currentColor and gold/blue accents via inline style.fill.
// ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: "'Space Mono', monospace" }
const slab = { fontFamily: "'Zilla Slab', 'Space Grotesk', serif" }
const CREAM = 'var(--poster-fg)'
const GOLD = 'var(--poster-gold)'
const DIM = 'var(--poster-fg-dim)'
const LINE = 'var(--poster-line)'
const BLUE = 'var(--acc)'
const OKC = 'var(--ok2)'
const WARNC = 'var(--warn2)'
const goldFill = { fill: 'var(--poster-gold)' }
const goldStroke = { stroke: 'var(--poster-gold)' }

// plausible default commands for a university satellite — placeholders
const COMMANDS = [
  { id: 'ping',     label: 'PING',                  ack: (s) => `ACK PING · RTT ${580 + (s % 7) * 38} ms` },
  { id: 'health',   label: 'Solicitar pacote de saúde', ack: () => 'ACK HEALTH · pacote agendado no próximo downlink' },
  { id: 'payload',  label: 'Alternar payload',      ack: (s, st) => `ACK PAYLOAD · payload ${st.payloadOn ? 'ATIVO' : 'EM ESPERA'}` },
  { id: 'attitude', label: 'Modo de atitude',       ack: (s, st) => `ACK ATT · modo ${st.attitude.toUpperCase()}` },
  { id: 'downlink', label: 'Solicitar downlink',    ack: () => 'ACK DL · janela de downlink aberta · 9.6 kbps' },
]
const ATT_MODES = ['nadir', 'sun-point', 'detumble']

// ── orbit viewport (flat poster Earth + animated satellite) ────────
function OrbitViewport({ signal, missionName }) {
  // ellipse the satellite rides — also the visible faint orbit line
  const ORBIT = 'M 250 118 A 180 78 0 1 1 249.9 118'
  return (
    <svg viewBox="0 0 500 380" style={{ width: '100%', height: '100%', display: 'block', color: 'var(--poster-fg)' }} preserveAspectRatio="xMidYMid meet">
      {/* deterministic starfield */}
      {Array.from({ length: 46 }, (_, i) => {
        const x = (i * 103 + 17) % 500, y = (i * 59 + 23) % 380
        return <circle key={i} cx={x} cy={y} r={i % 8 === 0 ? 1.4 : 0.8} fill="currentColor" opacity={0.35} />
      })}

      {/* Earth — simplified poster graphic, not photoreal (fixed colours) */}
      <circle cx="250" cy="196" r="86" fill="#2E5E8C" />
      <path d="M213 142c14-9 33-8 41 2 7 9-2 18-14 20-14 2-24 12-33 7-10-6-6-21 6-29z" fill="#3F7D5C" opacity=".9" />
      <path d="M268 214c12-5 26-2 30 7 4 8-5 16-17 16s-25-4-25-11c0-6 5-9 12-12z" fill="#3F7D5C" opacity=".9" />
      <path d="M222 232c8-2 15 1 15 7s-8 10-16 8-12-7-9-11c2-3 6-3 10-4z" fill="#3F7D5C" opacity=".85" />
      <circle cx="250" cy="196" r="86" fill="url(#earth-shade)" />
      <circle cx="250" cy="196" r="86" fill="none" stroke="currentColor" strokeOpacity=".25" />
      <ellipse cx="250" cy="196" rx="86" ry="30" fill="none" stroke="currentColor" strokeOpacity=".12" />
      <ellipse cx="250" cy="196" rx="44" ry="86" fill="none" stroke="currentColor" strokeOpacity=".12" />

      {/* visible orbit path */}
      <path d={ORBIT} fill="none" stroke="currentColor" strokeOpacity=".4" strokeWidth="1" strokeDasharray="4 6" />

      {/* satellite riding the orbit (plausible LEO-ish period, scaled) */}
      <g>
        <g>
          <rect x="-6" y="-6" width="12" height="12" fill="currentColor" />
          <rect x="-19" y="-3" width="11" height="6" style={goldFill} />
          <rect x="8" y="-3" width="11" height="6" style={goldFill} />
          <animateMotion dur="22s" repeatCount="indefinite" path={ORBIT} rotate="auto" />
        </g>
      </g>

      {/* ground station marker */}
      <g transform="translate(250 352)">
        <path d="M-13 6 A 13 13 0 0 1 13 6 Z" fill="none" style={goldStroke} strokeWidth="1.8" transform="rotate(-32)" />
        <line x1="0" y1="0" x2="0" y2="14" style={goldStroke} strokeWidth="1.8" />
        <line x1="-9" y1="14" x2="9" y2="14" style={goldStroke} strokeWidth="1.8" />
        <text x="18" y="12" fontFamily="'Space Mono', monospace" fontSize="11" fill="currentColor" fillOpacity=".75">
          GS·{(missionName || 'FORGE').slice(0, 10).toUpperCase()}
        </text>
      </g>

      {/* uplink / downlink corridor + traveling signal pulse */}
      <line x1="250" y1="338" x2="250" y2="278" stroke="currentColor" strokeOpacity={signal ? '.35' : '.12'} strokeWidth="1" strokeDasharray="2 5" />
      {signal && (
        <circle r="3.4" style={{ fill: signal.dir === 'up' ? 'var(--poster-gold)' : 'var(--acc)' }} key={signal.key}>
          <animateMotion
            dur="1.1s" repeatCount="1" fill="freeze"
            path={signal.dir === 'up' ? 'M 250 338 L 250 274' : 'M 250 274 L 250 338'} />
          <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.15;.85;1" dur="1.1s" fill="freeze" />
        </circle>
      )}

      <defs>
        {/* sphere shading is light-independent: white highlight → black core */}
        <radialGradient id="earth-shade" cx="34%" cy="30%" r="85%">
          <stop offset="0%" stopColor="#fff" stopOpacity=".22" />
          <stop offset="55%" stopColor="#fff" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity=".38" />
        </radialGradient>
      </defs>
    </svg>
  )
}

// ── compact sparkline (kept from the previous chart view) ──────────
function Sparkline({ data, color, unit, label, value, domain }) {
  const W = 240, H = 54, pad = 4
  const pts = (data || []).filter(v => v != null)
  let path = ''
  if (pts.length > 1) {
    const min = domain ? domain[0] : Math.min(...pts)
    const max = domain ? domain[1] : Math.max(...pts)
    const span = max - min || 1
    const stepX = (W - pad * 2) / (pts.length - 1)
    path = pts.map((v, i) => {
      const x = pad + i * stepX
      const y = H - pad - ((v - min) / span) * (H - pad * 2)
      return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
  }
  return (
    <div style={{ borderTop: `1px solid ${LINE}`, padding: '8px 0 2px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
        <span style={{ ...mono, fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: DIM }}>{label}</span>
        <span style={{ ...mono, fontSize: 13.5, fontWeight: 700, color }}>{value ?? '—'}<span style={{ fontSize: 10, color: DIM, marginLeft: 3 }}>{unit}</span></span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: 'block', color: 'var(--poster-fg-dim)' }}>
        {path
          ? <path d={path} fill="none" style={{ stroke: color }} strokeWidth="1.4" strokeLinejoin="round" />
          : <text x={W / 2} y={H / 2} textAnchor="middle" fontFamily="'Space Mono', monospace" fontSize="10" fill="currentColor">aguardando…</text>}
      </svg>
    </div>
  )
}

function ReadoutRow({ label, value, accent }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '7px 0', borderBottom: `1px solid ${LINE}` }}>
      <span style={{ ...mono, fontSize: 11.5, letterSpacing: '.08em', textTransform: 'uppercase', color: DIM }}>{label}</span>
      <span style={{ ...mono, fontSize: 14, fontWeight: 700, color: accent || CREAM }}>{value}</span>
    </div>
  )
}

const fmtUptime = (sec) => {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function TelemetryPanel() {
  const { telemetry, seq, hwLink, missionPlan, entities } = useForge()
  const last = telemetry[telemetry.length - 1] || {}

  const [log, setLog] = useState([{ t: 'sys', m: 'estação terrestre online · aguardando comandos' }])
  const [signal, setSignal] = useState(null)        // { dir:'up'|'down', key }
  const [payloadOn, setPayloadOn] = useState(true)
  const [attIdx, setAttIdx] = useState(0)
  const [lastAck, setLastAck] = useState('—')
  const [busy, setBusy] = useState(false)
  const logRef = useRef(null)
  const timers = useRef([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  useEffect(() => { logRef.current?.scrollTo(0, 1e6) }, [log])

  // slowly drifting mock values, deterministic on the sim clock
  const battery = (8.2 - seq * 0.0011 - (seq % 9) * 0.004).toFixed(2)
  const link = 82 + Math.round(Math.sin(seq / 2) * 7) + (seq % 3)
  const obcTemp = last.temp != null ? (last.temp + 9.5).toFixed(1) : (28 + Math.sin(seq / 3) * 2).toFixed(1)

  const sendCommand = (cmd) => {
    if (busy) return
    setBusy(true)
    track('gs_command', { target: cmd.id })
    // state changes the ACK text reports
    const st = {
      payloadOn: cmd.id === 'payload' ? !payloadOn : payloadOn,
      attitude: ATT_MODES[cmd.id === 'attitude' ? (attIdx + 1) % ATT_MODES.length : attIdx],
    }
    if (cmd.id === 'payload') setPayloadOn(st.payloadOn)
    if (cmd.id === 'attitude') setAttIdx(i => (i + 1) % ATT_MODES.length)

    setLog(l => [...l, { t: 'tx', m: `CMD ${cmd.label.toUpperCase()}` }])
    setSignal({ dir: 'up', key: Date.now() })
    timers.current.push(setTimeout(() => {
      setSignal({ dir: 'down', key: Date.now() + 1 })
      const ackText = `${cmd.ack(seq, st)} (simulado)`
      setLog(l => [...l, { t: 'rx', m: ackText }])
      setLastAck(cmd.label.split(' ')[0].toUpperCase())
      if (cmd.id === 'health') {
        setLog(l => [...l, { t: 'rx', m: `HEALTH · bat ${battery} V · obc ${obcTemp} °C · link ${link}% (simulado)` }])
      }
      timers.current.push(setTimeout(() => { setSignal(null); setBusy(false) }, 1200))
    }, 1200))
  }

  const real = hwLink.connected
  const charts = [
    entities.bmp280 && { label: 'temperatura', key: 'temp', color: WARNC, unit: '°C', domain: [15, 30] },
    entities.bmp280 && { label: 'pressão', key: 'press', color: BLUE, unit: 'hPa', domain: [650, 720] },
    entities.mpu6050 && { label: 'aceleração z', key: 'accel', color: GOLD, unit: 'g', domain: [0.9, 1.1] },
  ].filter(Boolean).slice(0, 2)

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      background: 'var(--poster-bg)',
    }}>
      {/* console header strip */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px',
        borderBottom: `1px solid ${LINE}`,
      }}>
        <span style={{ ...slab, fontSize: 19, fontWeight: 700, color: CREAM }}>Estação terrestre</span>
        <span style={{ ...mono, fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: DIM }}>
          {missionPlan.name ? `missão ${missionPlan.name}` : 'missão sem nome'} · t+{fmtUptime(seq * 3)}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{
          ...mono, fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase',
          padding: '3px 9px', borderRadius: 3,
          background: real ? 'rgba(46,122,79,.3)' : 'var(--poster-card-sel)',
          color: real ? OKC : GOLD, border: `1px solid ${real ? 'rgba(127,212,160,.4)' : 'var(--poster-line)'}`,
        }}>{real ? 'hardware real' : 'dados simulados'}</span>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* ── command console ─────────────────────────────────────── */}
        <div style={{ width: 282, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${LINE}`, padding: '14px 16px', minHeight: 0 }}>
          <div style={{ ...mono, fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', color: DIM, marginBottom: 4 }}>
            console de comando
          </div>
          <div style={{ ...mono, fontSize: 10.5, color: GOLD, marginBottom: 12 }}>
            comandos de exemplo · placeholders
          </div>
          {COMMANDS.map(c => (
            <button key={c.id} onClick={() => sendCommand(c)} disabled={busy} style={{
              display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
              padding: '9px 12px', borderRadius: 6, marginBottom: 7, cursor: busy ? 'wait' : 'pointer',
              background: 'var(--poster-card)', border: `1px solid ${LINE}`,
              color: CREAM, fontSize: 14, fontFamily: "'Space Grotesk', sans-serif",
              opacity: busy ? .55 : 1, transition: 'all .15s',
            }}
              onMouseEnter={e => { if (!busy) e.currentTarget.style.borderColor = 'var(--poster-gold)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--poster-line)' }}>
              <span style={{ ...mono, fontSize: 10, color: GOLD }}>▲</span>{c.label}
            </button>
          ))}

          {/* command/ack log */}
          <div style={{ ...mono, fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: DIM, margin: '10px 0 6px' }}>
            log de enlace
          </div>
          <div ref={logRef} style={{ flex: 1, overflowY: 'auto', minHeight: 60, paddingRight: 4 }}>
            {log.slice(-40).map((l, i) => (
              <div key={i} style={{
                ...mono, fontSize: 11.5, lineHeight: 1.55,
                color: l.t === 'tx' ? GOLD : l.t === 'rx' ? BLUE : DIM,
              }}>{l.t === 'tx' ? '» ' : l.t === 'rx' ? '‹ ' : '# '}{l.m}</div>
            ))}
          </div>
        </div>

        {/* ── orbit viewport ──────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <OrbitViewport signal={signal} missionName={missionPlan.name} />
          <div style={{
            position: 'absolute', left: 14, bottom: 10, ...mono, fontSize: 10.5,
            letterSpacing: '.14em', textTransform: 'uppercase', color: DIM,
          }}>órbita ilustrativa · período fora de escala</div>
        </div>

        {/* ── telemetry readout ───────────────────────────────────── */}
        <div style={{ width: 268, flexShrink: 0, borderLeft: `1px solid ${LINE}`, padding: '14px 16px', overflowY: 'auto' }}>
          <div style={{ ...mono, fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', color: DIM, marginBottom: 10 }}>
            telemetria {real ? '· tempo real' : '· simulada'}
          </div>
          <ReadoutRow label="bateria" value={`${battery} V`} accent={battery < 7.2 ? WARNC : undefined} />
          <ReadoutRow label="temp. de bordo" value={`${obcTemp} °C`} />
          <ReadoutRow label="qualidade do enlace" value={`${link} %`} accent={link < 75 ? WARNC : OKC} />
          <ReadoutRow label="último comando ack" value={lastAck} />
          <ReadoutRow label="payload" value={payloadOn ? 'ATIVO' : 'ESPERA'} accent={payloadOn ? OKC : GOLD} />
          <ReadoutRow label="modo de atitude" value={ATT_MODES[attIdx].toUpperCase()} />
          <ReadoutRow label="uptime" value={fmtUptime(seq * 3)} />

          {charts.length > 0 && (
            <div style={{ marginTop: 14 }}>
              {charts.map(c => (
                <Sparkline key={c.key} label={c.label} unit={c.unit} color={c.color} domain={c.domain}
                  data={telemetry.map(t => t[c.key])} value={last[c.key] ?? null} />
              ))}
            </div>
          )}

          <div style={{ ...mono, fontSize: 10.5, lineHeight: 1.6, color: DIM, marginTop: 14 }}>
            {real
              ? 'valores vindos do ESP32 conectado via ponte serial'
              : 'valores gerados pela simulação da missão — conecte um ESP32 real na aba Firmware para dados reais'}
          </div>
        </div>
      </div>
    </div>
  )
}
