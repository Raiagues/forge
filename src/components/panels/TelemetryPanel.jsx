import { useEffect, useRef, useState } from 'react'
import useForge, { COMPONENT_DEFS } from '../../store/useForge'
import ForgeCanvas from '../canvas/ForgeCanvas'

// ──────────────────────────────────────────────────────────────────
// Simulação — live validation environment. Just TWO things: the real PCB
// model (the exact hardware-screen renderer, reused in sim mode) on the
// right, rotating to mirror the physical board via the MPU6050; and the
// live sensor values on the left. REAL serial data only — never simulated.
// No grid, no serial console, no extra chrome.
// ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: "'Space Mono', monospace" }
const STALE_MS = 2500
const HIST = 20            // sparkline window (samples ≈ seconds)
const fresh = (t) => t != null && Date.now() - t < STALE_MS

function parseBmp(reading) {
  if (!reading) return {}
  const m = String(reading).match(/(-?[\d.]+)\s*°C.*?(-?[\d.]+)\s*hPa/)
  return m ? { temp: +m[1], press: +m[2] } : {}
}

// flat/honest sparkline — renders nothing meaningful until there is real
// history (a flat baseline is shown rather than a fake wave)
function Spark({ series }) {
  const vals = (series || []).filter(v => v != null)
  const W = 90, H = 20
  if (vals.length < 2) return <svg width={W} height={H}><line x1="0" y1={H - 2} x2={W} y2={H - 2} stroke="var(--rule2)" strokeWidth="1" /></svg>
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * W},${(H - ((v - min) / span) * (H - 3) - 1.5).toFixed(1)}`).join(' ')
  return <svg width={W} height={H}><polyline points={pts} fill="none" stroke="var(--acc2)" strokeWidth="1.3" strokeLinejoin="round" /></svg>
}

function SensorBlock({ id, channels, connected }) {
  const def = COMPONENT_DEFS[id]
  return (
    <div style={{ border: '1px solid var(--rule)', borderRadius: 8, background: 'var(--paper)', padding: '11px 13px', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className={connected ? 'pulse' : ''} style={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, background: connected ? 'var(--ok2)' : 'var(--ink4)' }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{def?.friendly || def?.label || id}</span>
        {!connected && <span style={{ ...mono, fontSize: 11, color: 'var(--ink4)', marginLeft: 'auto' }}>não conectado</span>}
      </div>
      {connected && channels.map(ch => (
        <div key={ch.k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
          <span style={{ ...mono, fontSize: 11, color: 'var(--ink4)', width: 64, flexShrink: 0 }}>{ch.k}</span>
          <span style={{ ...mono, fontSize: 13, color: 'var(--ink)', width: 88, flexShrink: 0 }}>{ch.v}</span>
          <Spark series={ch.hist} />
        </div>
      ))}
    </div>
  )
}

export default function TelemetryPanel() {
  const entities = useForge(s => s.entities)
  const fw = useForge(s => s.fw)
  const [, tick] = useState(0)
  const hist = useRef({})   // channel key → rolling real samples

  // sample REAL values once per second while the link is up; clear on drop
  useEffect(() => {
    const id = setInterval(() => {
      const f = useForge.getState().fw
      if (f.connected) {
        const push = (k, v) => { if (v == null || Number.isNaN(v)) return; const a = hist.current[k] || (hist.current[k] = []); a.push(v); if (a.length > HIST) a.shift() }
        const b = parseBmp(f.reading)
        if (fresh(f.hw.lastReadAt)) { push('temp', b.temp); push('press', b.press) }
        const imu = f.hw.imu
        if (imu && fresh(imu.at)) { push('roll', imu.euler?.roll ?? imu.ax); push('pitch', imu.euler?.pitch ?? imu.ay) }
      } else {
        hist.current = {}
      }
      tick(t => t + 1)
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const link = fw.connected
  const imuLive = link && fresh(fw.hw.imu?.at)
  const bmpLive = link && fresh(fw.hw.lastReadAt)
  const b = parseBmp(fw.reading)
  const imu = fw.hw.imu

  // one block per sensor actually on the board (+ the ESP32), real status only
  const blocks = []
  if (entities.esp32) blocks.push({ id: 'esp32', connected: link, channels: [] })
  if (entities.bmp280) blocks.push({
    id: 'bmp280', connected: bmpLive,
    channels: [
      { k: 'temp', v: b.temp != null ? `${b.temp.toFixed(1)} °C` : '—', hist: hist.current.temp },
      { k: 'pressão', v: b.press != null ? `${b.press.toFixed(0)} hPa` : '—', hist: hist.current.press },
    ],
  })
  if (entities.mpu6050) blocks.push({
    id: 'mpu6050', connected: imuLive,
    channels: [
      { k: 'roll', v: imu?.euler?.roll != null ? `${imu.euler.roll.toFixed(0)}°` : '—', hist: hist.current.roll },
      { k: 'pitch', v: imu?.euler?.pitch != null ? `${imu.euler.pitch.toFixed(0)}°` : '—', hist: hist.current.pitch },
      { k: 'yaw', v: imu?.euler?.yaw != null ? `${imu.euler.yaw.toFixed(0)}°` : '—' },
    ],
  })

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--paper)', minHeight: 0 }}>
      {/* top bar — only name + connection status */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--rule)', background: 'var(--paper2)' }}>
        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Simulação</span>
        <span style={{ flex: 1 }} />
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: link ? 'var(--ok2)' : 'var(--ink4)' }} />
        <span style={{ ...mono, fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: link ? 'var(--ok2)' : 'var(--ink4)' }}>{link ? 'ESP32 conectado' : 'aguardando conexão'}</span>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* left — live sensor values (real only) */}
        <div style={{ width: 340, flexShrink: 0, borderRight: '1px solid var(--rule)', overflowY: 'auto', padding: '12px 14px' }}>
          {blocks.length === 0 && <div style={{ ...mono, fontSize: 12, color: 'var(--ink4)' }}>nenhum sensor na placa.</div>}
          {blocks.map(bl => <SensorBlock key={bl.id} id={bl.id} channels={bl.channels} connected={bl.connected} />)}
        </div>

        {/* right — the real PCB model, rotating with the MPU6050 */}
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <ForgeCanvas sim={{ imu, live: imuLive }} />
          {!imuLive && (
            <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', ...mono, fontSize: 12, letterSpacing: '.06em', color: 'var(--ink4)', background: 'var(--paper2)', border: '1px solid var(--rule)', borderRadius: 6, padding: '5px 12px', pointerEvents: 'none' }}>
              aguardando conexão · placa em posição neutra
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
