import { useEffect, useRef } from 'react'
import useForge, { COMPONENT_DEFS } from '../../store/useForge'
import DigitalTwin from './DigitalTwin'

// ──────────────────────────────────────────────────────────────────
// TelemetryPanel — live SENSOR VALIDATION environment (prompt D, Part 2).
//
// The orbiting-satellite ground station was wrong for the real use case:
// university teams validating hardware on a bench / balloon, not flying a
// satellite. This is a flight-computer GSE / logic-analyser style view:
//   · LEFT   — live readout per connected sensor: channels, 30 s sparkline,
//              status (verde nominal / âmbar fora de faixa / vermelho sem
//              resposta).
//   · CENTER — the 3D digital twin (the board), driven by real MPU6050
//              orientation (reuses DigitalTwin: slerp-smoothed, live/sim).
//   · BOTTOM — raw serial console with timestamps, so the team verifies
//              exactly what is arriving.
// Honest: "ao vivo" only when a real ESP32 link is open, else "simulação".
// ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: "'Space Mono', monospace" }
const CONSOLE_BG = '#0C1422'
const num = (v) => { const n = parseFloat(String(v)); return Number.isFinite(n) ? n : null }

// channels we keep a 30 s sparkline for, mapped to the rolling telemetry sample
const SPARK_FIELD = { temperature: 'temp', pressure: 'press', accel_z: 'accel', free_heap: 'heap' }
const RANGE = { temperature: [-40, 85], pressure: [300, 1100], accel_z: [0.85, 1.15] }

function Spark({ series }) {
  const vals = series.filter(v => v != null)
  if (vals.length < 2) return <div style={{ height: 22 }} />
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1
  const W = 96, H = 22
  const pts = series.map((v, i) => {
    const x = (i / (series.length - 1)) * W
    const y = v == null ? H : H - ((v - min) / span) * (H - 3) - 1.5
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke="var(--acc2)" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}

function SensorBlock({ id, entities, telemetry, wiring }) {
  const def = COMPONENT_DEFS[id]
  const wired = id === 'esp32' ? true : !!wiring[id]?.wired
  const readings = wired ? (entities[id].readings || {}) : {}
  const keys = Object.keys(readings)
  // status: red = not responding, amber = a channel out of range, green = nominal
  const outOfRange = keys.some(k => RANGE[k] && (num(readings[k]) < RANGE[k][0] || num(readings[k]) > RANGE[k][1]))
  const status = !wired || keys.length === 0 ? 'down' : outOfRange ? 'warn' : 'ok'
  const dot = { ok: 'var(--ok2)', warn: 'var(--warn2)', down: 'var(--err2)' }[status]
  const statusLabel = { ok: 'nominal', warn: 'fora de faixa', down: 'sem resposta' }[status]
  return (
    <div style={{ border: '1px solid var(--rule)', borderRadius: 8, background: 'var(--paper)', padding: '10px 12px', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span className={status === 'ok' ? 'pulse' : ''} style={{ width: 9, height: 9, borderRadius: '50%', background: dot, flexShrink: 0 }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{def?.friendly || def?.label || id}</span>
        <span style={{ ...mono, fontSize: 10, color: 'var(--ink4)' }}>{def?.label}</span>
        <span style={{ ...mono, fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: dot, marginLeft: 'auto' }}>{statusLabel}</span>
      </div>
      {status === 'down' && <div style={{ ...mono, fontSize: 11, color: 'var(--ink4)' }}>não conectado — verifique a fiação</div>}
      {keys.map(k => {
        const bad = RANGE[k] && (num(readings[k]) < RANGE[k][0] || num(readings[k]) > RANGE[k][1])
        const field = SPARK_FIELD[k]
        return (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
            <span style={{ ...mono, fontSize: 11, color: 'var(--ink4)', width: 92, flexShrink: 0 }}>{k}</span>
            <span style={{ ...mono, fontSize: 12.5, fontWeight: bad ? 700 : 400, color: bad ? 'var(--err2)' : 'var(--ink)', width: 96, flexShrink: 0 }}>{String(readings[k])}</span>
            {field && <Spark series={telemetry.map(s => s[field])} />}
          </div>
        )
      })}
    </div>
  )
}

function SerialConsole({ serialLog }) {
  const ref = useRef(null)
  const lines = serialLog.slice().reverse()   // oldest → newest
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight }, [serialLog])
  const color = (cls) => ({ err: '#E5736B', warn: '#E0B24A', ok: '#6FCF97', rx: '#7FB2F0', tx: '#E0B24A' }[cls] || '#9FB2C8')
  return (
    <div style={{ flexShrink: 0, height: 156, borderTop: '1px solid var(--rule)', background: CONSOLE_BG, display: 'flex', flexDirection: 'column' }}>
      <div style={{ ...mono, fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: '#7C8BA0', padding: '6px 12px 4px' }}>console serial · stream bruto</div>
      <div ref={ref} style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {lines.length === 0 && <div style={{ ...mono, fontSize: 12, color: '#5C6B80' }}>aguardando dados do dispositivo…</div>}
        {lines.map((l, i) => (
          <div key={i} style={{ ...mono, fontSize: 11.5, lineHeight: 1.55, color: color(l.cls), whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            <span style={{ color: '#566679' }}>{l.t} </span>{l.m}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function TelemetryPanel() {
  const entities = useForge(s => s.entities)
  const telemetry = useForge(s => s.telemetry)
  const serialLog = useForge(s => s.serialLog)
  const wiring = useForge(s => s.live?.wiring) || {}
  const hwLink = useForge(s => s.hwLink)
  const liveLink = !!hwLink?.connected

  const sensorIds = ['esp32', 'bmp280', 'mpu6050'].filter(id => entities[id])
  const hasMpu = !!entities.mpu6050

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--paper)', minHeight: 0 }}>
      {/* header / link status */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--rule)', background: 'var(--paper2)' }}>
        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Validação de sensores</span>
        <span style={{ ...mono, fontSize: 11, color: 'var(--ink4)' }}>bancada · GSE</span>
        <span style={{ flex: 1 }} />
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: liveLink ? 'var(--ok2)' : 'var(--warn2)' }} />
        <span style={{ ...mono, fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: liveLink ? 'var(--ok2)' : 'var(--warn2)' }}>{liveLink ? 'ao vivo · ESP32' : 'simulação'}</span>
      </div>

      {/* top: sensor readout (left) + 3D twin (center) */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ width: 384, flexShrink: 0, borderRight: '1px solid var(--rule)', overflowY: 'auto', padding: '12px 14px' }}>
          <div style={{ ...mono, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 10 }}>Leitura ao vivo</div>
          {sensorIds.length === 0 && <div style={{ ...mono, fontSize: 12, color: 'var(--ink4)' }}>nenhum sensor na placa — adicione hardware na seção Hardware.</div>}
          {sensorIds.map(id => <SensorBlock key={id} id={id} entities={entities} telemetry={telemetry} wiring={wiring} />)}
        </div>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'baseline', gap: 8, padding: '8px 14px 0' }}>
            <span style={{ ...mono, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink4)' }}>Gêmeo digital · orientação</span>
            {!hasMpu && <span style={{ ...mono, fontSize: 10.5, color: 'var(--ink4)' }}>(adicione um MPU6050 para orientação 3D)</span>}
            {hasMpu && !liveLink && <span style={{ ...mono, fontSize: 10.5, color: 'var(--ink4)' }}>aguardando conexão — posição neutra</span>}
          </div>
          <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            <DigitalTwin sensorId={hasMpu ? 'mpu6050' : 'bmp280'} />
          </div>
        </div>
      </div>

      {/* bottom: raw serial console */}
      <SerialConsole serialLog={serialLog} />
    </div>
  )
}
