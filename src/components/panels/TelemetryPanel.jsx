import { useEffect, useRef, useState } from 'react'
import useForge from '../../store/useForge'
import { track } from '../../lib/analytics.js'

// ──────────────────────────────────────────────────────────────────
// TelemetryPanel — ground station ("estação terrestre"), mission-control
// layout:
//   · beige (themed) side panels — command console LEFT, readout RIGHT
//   · a real SPACE viewport in the CENTER (dark starfield + flat poster
//     Earth + the satellite riding a visible orbit)
//   · a VS-Code-style link log docked at the BOTTOM, height-resizable
// Data is shown as VISUAL gauges/scales (a bar with the value beneath),
// not line charts. Honesty preserved: "dados simulados" until a real
// hwLink exists.
// ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: "'Space Mono', monospace" }
// the space viewport is dark in BOTH themes (space is dark); its ink is
// cream and its accents amber/blue — fixed, not themed.
const SPACE_BG = 'radial-gradient(130% 130% at 70% 12%, #16263F 0%, #0C1A2E 55%, #060E1C 100%)'
const SPACE_INK = '#F4EFE6'
const LOG_BG = '#0C1422'
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

const COMMANDS = [
  { id: 'ping',     label: 'Ping',                  ack: (s) => `ACK PING · RTT ${580 + (s % 7) * 38} ms` },
  { id: 'health',   label: 'Pacote de saúde',       ack: () => 'ACK HEALTH · pacote agendado no próximo downlink' },
  { id: 'payload',  label: 'Alternar payload',      ack: (s, st) => `ACK PAYLOAD · payload ${st.payloadOn ? 'ATIVO' : 'EM ESPERA'}` },
  { id: 'attitude', label: 'Modo de atitude',       ack: (s, st) => `ACK ATT · modo ${st.attitude.toUpperCase()}` },
  { id: 'downlink', label: 'Solicitar downlink',    ack: () => 'ACK DL · janela aberta · 9.6 kbps' },
]
const ATT_MODES = ['nadir', 'sun-point', 'detumble']

// ── space viewport (flat poster Earth + animated satellite) ────────
function OrbitViewport({ signal, missionName }) {
  const ORBIT = 'M 250 118 A 180 78 0 1 1 249.9 118'
  return (
    <svg viewBox="0 0 500 380" preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: '100%', display: 'block', color: SPACE_INK }}>
      {Array.from({ length: 60 }, (_, i) => {
        const x = (i * 103 + 17) % 500, y = (i * 59 + 23) % 380
        return <circle key={i} cx={x} cy={y} r={i % 8 === 0 ? 1.4 : 0.7} fill="currentColor" opacity={i % 8 === 0 ? 0.5 : 0.28} />
      })}
      <circle cx="250" cy="196" r="86" fill="#2E5E8C" />
      <path d="M213 142c14-9 33-8 41 2 7 9-2 18-14 20-14 2-24 12-33 7-10-6-6-21 6-29z" fill="#3F7D5C" opacity=".9" />
      <path d="M268 214c12-5 26-2 30 7 4 8-5 16-17 16s-25-4-25-11c0-6 5-9 12-12z" fill="#3F7D5C" opacity=".9" />
      <path d="M222 232c8-2 15 1 15 7s-8 10-16 8-12-7-9-11c2-3 6-3 10-4z" fill="#3F7D5C" opacity=".85" />
      <circle cx="250" cy="196" r="86" fill="url(#earth-shade)" />
      <circle cx="250" cy="196" r="86" fill="none" stroke="currentColor" strokeOpacity=".25" />
      <ellipse cx="250" cy="196" rx="86" ry="30" fill="none" stroke="currentColor" strokeOpacity=".12" />
      <path d={ORBIT} fill="none" stroke="currentColor" strokeOpacity=".4" strokeWidth="1" strokeDasharray="4 6" />
      <g>
        <rect x="-6" y="-6" width="12" height="12" fill="currentColor" />
        <rect x="-19" y="-3" width="11" height="6" fill="#E3A132" />
        <rect x="8" y="-3" width="11" height="6" fill="#E3A132" />
        <animateMotion dur="22s" repeatCount="indefinite" path={ORBIT} rotate="auto" />
      </g>
      <g transform="translate(250 352)">
        <path d="M-13 6 A 13 13 0 0 1 13 6 Z" fill="none" stroke="#E3A132" strokeWidth="1.8" transform="rotate(-32)" />
        <line x1="0" y1="0" x2="0" y2="14" stroke="#E3A132" strokeWidth="1.8" />
        <line x1="-9" y1="14" x2="9" y2="14" stroke="#E3A132" strokeWidth="1.8" />
        <text x="18" y="12" fontFamily="'Space Mono', monospace" fontSize="11" fill="currentColor" fillOpacity=".75">
          GS·{(missionName || 'FORGE').slice(0, 10).toUpperCase()}
        </text>
      </g>
      <line x1="250" y1="338" x2="250" y2="278" stroke="currentColor" strokeOpacity={signal ? '.35' : '.12'} strokeWidth="1" strokeDasharray="2 5" />
      {signal && (
        <circle r="3.4" fill={signal.dir === 'up' ? '#E3A132' : '#8FC0F0'} key={signal.key}>
          <animateMotion dur="1.1s" repeatCount="1" fill="freeze"
            path={signal.dir === 'up' ? 'M 250 338 L 250 274' : 'M 250 274 L 250 338'} />
          <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.15;.85;1" dur="1.1s" fill="freeze" />
        </circle>
      )}
      <defs>
        <radialGradient id="earth-shade" cx="34%" cy="30%" r="85%">
          <stop offset="0%" stopColor="#fff" stopOpacity=".22" />
          <stop offset="55%" stopColor="#fff" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity=".42" />
        </radialGradient>
      </defs>
    </svg>
  )
}

// ── a metric as a visual scale: a track with a fill (and optional range
//    ticks) and the value printed beneath the bar ───────────────────
function Gauge({ label, value, unit, pct, tone = 'var(--acc)', range }) {
  return (
    <div style={{ marginBottom: 13 }}>
      <div style={{ ...mono, fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 5 }}>{label}</div>
      <div style={{ position: 'relative', height: 8, borderRadius: 4, background: 'var(--paper4)', overflow: 'hidden' }}>
        <div style={{ width: `${clamp(pct * 100, 2, 100)}%`, height: '100%', background: tone, borderRadius: 4, transition: 'width .4s ease' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
        <span style={{ ...mono, fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>
          {value}<span style={{ fontSize: 11, color: 'var(--ink4)', marginLeft: 3 }}>{unit}</span>
        </span>
        {range && <span style={{ ...mono, fontSize: 9.5, color: 'var(--ink4)' }}>{range}</span>}
      </div>
    </div>
  )
}

function StateRow({ label, value, tone }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--rule2)' }}>
      <span style={{ ...mono, fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink4)' }}>{label}</span>
      <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: tone || 'var(--ink)' }}>{value}</span>
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
  const [signal, setSignal] = useState(null)
  const [payloadOn, setPayloadOn] = useState(true)
  const [attIdx, setAttIdx] = useState(0)
  const [lastAck, setLastAck] = useState('—')
  const [busy, setBusy] = useState(false)
  const [logH, setLogH] = useState(150)              // resizable bottom log
  const logRef = useRef(null)
  const timers = useRef([])
  const drag = useRef(null)
  const startH = useRef(150)
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  useEffect(() => { logRef.current?.scrollTo(0, 1e6) }, [log])

  // drag the divider to resize the bottom log (VS-Code style)
  useEffect(() => {
    const move = (e) => { if (drag.current != null) setLogH(clamp(drag.current - e.clientY + startH.current, 80, 360)) }
    const up = () => { drag.current = null; document.body.style.userSelect = '' }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [])
  const onDragStart = (e) => { drag.current = e.clientY; startH.current = logH; document.body.style.userSelect = 'none' }

  const battery = +(8.2 - seq * 0.0011 - (seq % 9) * 0.004).toFixed(2)
  const link = 82 + Math.round(Math.sin(seq / 2) * 7) + (seq % 3)
  const obcTemp = +(last.temp != null ? (last.temp + 9.5) : (28 + Math.sin(seq / 3) * 2)).toFixed(1)
  const real = hwLink.connected

  const sendCommand = (cmd) => {
    if (busy) return
    setBusy(true)
    track('gs_command', { target: cmd.id })
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
      setLog(l => [...l, { t: 'rx', m: `${cmd.ack(seq, st)} (simulado)` }])
      setLastAck(cmd.label.split(' ')[0].toUpperCase())
      if (cmd.id === 'health') setLog(l => [...l, { t: 'rx', m: `HEALTH · bat ${battery} V · obc ${obcTemp} °C · link ${link}% (simulado)` }])
      timers.current.push(setTimeout(() => { setSignal(null); setBusy(false) }, 1200))
    }, 1200))
  }

  const panel = { background: 'var(--paper2)', display: 'flex', flexDirection: 'column', minHeight: 0 }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--paper)' }}>
      {/* header */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', background: 'var(--paper2)', borderBottom: '1px solid var(--rule)' }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>Estação terrestre</span>
        <span style={{ ...mono, fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink4)' }}>
          {missionPlan.name ? missionPlan.name : 'sem nome'} · t+{fmtUptime(seq * 3)}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{
          ...mono, fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase',
          padding: '3px 9px', borderRadius: 'var(--r-sm)',
          background: real ? 'rgba(46,122,79,.16)' : 'rgba(227,161,50,.16)',
          color: real ? 'var(--ok2)' : 'var(--warn2)',
        }}>{real ? 'hardware real' : 'dados simulados'}</span>
      </div>

      {/* main: console · space · readout */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* command console (beige) */}
        <div style={{ ...panel, width: 250, flexShrink: 0, borderRight: '1px solid var(--rule)', padding: '14px 14px' }}>
          <div style={{ ...mono, fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 10 }}>Comandos</div>
          {COMMANDS.map(c => (
            <button key={c.id} onClick={() => sendCommand(c)} disabled={busy} style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
              padding: '9px 11px', borderRadius: 'var(--r-md)', marginBottom: 6, cursor: busy ? 'wait' : 'pointer',
              background: 'var(--paper)', border: '1px solid var(--rule)',
              color: 'var(--ink)', fontSize: 13.5, fontFamily: "'Space Grotesk', sans-serif",
              opacity: busy ? .55 : 1, transition: 'all .15s',
            }}
              onMouseEnter={e => { if (!busy) e.currentTarget.style.borderColor = 'var(--acc)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--rule)' }}>
              <span style={{ ...mono, fontSize: 11, color: 'var(--acc)' }}>↟</span>{c.label}
            </button>
          ))}
        </div>

        {/* space viewport (dark, both themes) */}
        <div style={{ flex: 1, minWidth: 0, position: 'relative', background: SPACE_BG }}>
          <OrbitViewport signal={signal} missionName={missionPlan.name} />
          <div style={{
            position: 'absolute', left: 14, bottom: 10, ...mono, fontSize: 10,
            letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(244,239,230,.5)',
          }}>órbita ilustrativa · fora de escala</div>
        </div>

        {/* readout (beige) — visual gauges, value beneath */}
        <div style={{ ...panel, width: 280, flexShrink: 0, borderLeft: '1px solid var(--rule)', padding: '14px 16px', overflowY: 'auto' }}>
          <div style={{ ...mono, fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 12 }}>
            Telemetria {real ? '· tempo real' : '· simulada'}
          </div>
          <Gauge label="Bateria" value={battery.toFixed(2)} unit="V" range="6.0–8.4"
            pct={(battery - 6.0) / (8.4 - 6.0)} tone={battery < 7.2 ? 'var(--warn2)' : 'var(--ok2)'} />
          <Gauge label="Qualidade do enlace" value={link} unit="%" range="0–100"
            pct={link / 100} tone={link < 75 ? 'var(--warn2)' : 'var(--ok2)'} />
          <Gauge label="Temperatura de bordo" value={obcTemp.toFixed(1)} unit="°C" range="0–60"
            pct={obcTemp / 60} tone="var(--acc)" />
          {entities.bmp280 && last.press != null && (
            <Gauge label="Pressão" value={Math.round(last.press)} unit="hPa" range="650–720"
              pct={(last.press - 650) / 70} tone="var(--acc)" />
          )}
          <div style={{ marginTop: 6 }}>
            <StateRow label="Payload" value={payloadOn ? 'ATIVO' : 'ESPERA'} tone={payloadOn ? 'var(--ok2)' : 'var(--warn2)'} />
            <StateRow label="Atitude" value={ATT_MODES[attIdx].toUpperCase()} />
            <StateRow label="Último ACK" value={lastAck} />
            <StateRow label="Uptime" value={fmtUptime(seq * 3)} />
          </div>
        </div>
      </div>

      {/* resize handle + VS-Code-style link log at the bottom */}
      <div onPointerDown={onDragStart} style={{ height: 6, flexShrink: 0, cursor: 'ns-resize', background: 'var(--paper3)', borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)' }} />
      <div style={{ height: logH, flexShrink: 0, display: 'flex', flexDirection: 'column', background: LOG_BG }}>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', borderBottom: '1px solid rgba(244,239,230,.08)' }}>
          <span style={{ ...mono, fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(244,239,230,.6)' }}>Log de enlace</span>
          <div style={{ flex: 1 }} />
          <button onClick={() => setLog([])} style={{ ...mono, fontSize: 10.5, letterSpacing: '.06em', textTransform: 'uppercase', background: 'none', border: 'none', color: 'rgba(244,239,230,.5)', cursor: 'pointer' }}>limpar</button>
        </div>
        <div ref={logRef} style={{ flex: 1, overflowY: 'auto', padding: '7px 12px' }}>
          {log.slice(-120).map((l, i) => (
            <div key={i} style={{
              ...mono, fontSize: 12.5, lineHeight: 1.6,
              color: l.t === 'tx' ? '#E3A132' : l.t === 'rx' ? '#8FC0F0' : 'rgba(244,239,230,.5)',
            }}>{l.t === 'tx' ? '» ' : l.t === 'rx' ? '‹ ' : '# '}{l.m}</div>
          ))}
        </div>
      </div>
    </div>
  )
}
