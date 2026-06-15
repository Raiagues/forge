import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useForge from '../../store/useForge'

// ──────────────────────────────────────────────────────────────────
// Digital twin — a LIVE visualization of a physical sensor, driven by
// the serial stream from the connected ESP32 (store slice `fw`).
//   · MPU6050 → a 3D board that rotates/tilts to mirror the real device
//     orientation (quaternion, Euler, or accel-derived — whichever the
//     firmware emits; see fwIngestSerial).
//   · BMP280  → live temperature + pressure gauges with a sparkline.
// Live data is badged with a pulsing green indicator; without a real link
// the twin runs a clearly-labelled SIMULATED idle so it is never dead.
// If the link drops, the twin FREEZES at the last known state and shows a
// disconnected badge rather than resetting or erroring.
// ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: "'Space Mono', monospace" }
const STALE_MS = 2500   // no fresh sample within this window → frozen

const deg = THREE.MathUtils.degToRad

// Build a target orientation quaternion from whatever the device emitted.
function targetQuat(imu) {
  const q = new THREE.Quaternion()
  if (!imu) return q
  if (imu.quat) {
    // stored as {w,x,y,z}; THREE order is (x,y,z,w)
    return q.set(imu.quat.x, imu.quat.y, imu.quat.z, imu.quat.w).normalize()
  }
  if (imu.euler) {
    const e = new THREE.Euler(deg(imu.euler.pitch || 0), deg(imu.euler.yaw || 0), deg(imu.euler.roll || 0), 'YXZ')
    return q.setFromEuler(e)
  }
  if (imu.ax != null) {
    // derive tilt from the gravity vector (board at rest ≈ 1g on one axis)
    const { ax, ay, az } = imu
    const roll = Math.atan2(ay, az)
    const pitch = Math.atan2(-ax, Math.hypot(ay, az))
    return q.setFromEuler(new THREE.Euler(pitch, 0, roll, 'YXZ'))
  }
  return q
}

// The board mesh — slerps toward the live target each frame for smoothness.
function TwinBoard({ getTarget, frozen }) {
  const ref = useRef()
  useFrame(() => {
    if (!ref.current) return
    const target = getTarget()
    if (target) ref.current.quaternion.slerp(target, frozen ? 0.0 : 0.25)
  })
  return (
    <group ref={ref}>
      {/* PCB substrate */}
      <mesh castShadow>
        <boxGeometry args={[2.4, 0.12, 1.6]} />
        <meshStandardMaterial color="#1f6f4a" metalness={0.1} roughness={0.7} />
      </mesh>
      {/* MPU6050 chip */}
      <mesh position={[0, 0.12, 0]}>
        <boxGeometry args={[0.55, 0.12, 0.55]} />
        <meshStandardMaterial color="#15202e" metalness={0.3} roughness={0.5} />
      </mesh>
      {/* header pins (orientation reference edge) */}
      <mesh position={[-1.05, 0.12, 0]}>
        <boxGeometry args={[0.18, 0.16, 1.4]} />
        <meshStandardMaterial color="#caa23a" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* axis marker so the user can read the orientation */}
      <mesh position={[0.9, 0.14, 0]}>
        <boxGeometry args={[0.5, 0.04, 0.08]} />
        <meshStandardMaterial color="#e0795f" emissive="#e0795f" emissiveIntensity={0.4} />
      </mesh>
    </group>
  )
}

function MpuTwin({ imu, live, frozen }) {
  // r3f reads through a ref-returning getter so it always sees the latest
  // sample without re-mounting the Canvas on every serial line.
  const imuRef = useRef(imu)
  imuRef.current = imu
  const simT = useRef(0)
  const getTarget = useMemo(() => () => {
    if (imuRef.current) return targetQuat(imuRef.current)
    // simulated idle tumble when there is no live data
    simT.current += 0.004
    const e = new THREE.Euler(Math.sin(simT.current) * 0.35, simT.current * 0.4, Math.cos(simT.current * 0.7) * 0.2, 'YXZ')
    return new THREE.Quaternion().setFromEuler(e)
  }, [])

  const e = imu ? eulerFromImu(imu) : null
  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 220, borderRadius: 8, overflow: 'hidden', background: 'radial-gradient(120% 120% at 50% 20%, #16263F 0%, #0C1A2E 70%)' }}>
      <Canvas camera={{ position: [3.2, 2.4, 3.6], fov: 42 }} dpr={[1, 2]}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 8, 5]} intensity={1.1} />
        <directionalLight position={[-4, 2, -3]} intensity={0.3} />
        <TwinBoard getTarget={getTarget} frozen={frozen} />
        <gridHelper args={[8, 16, '#2a3a52', '#1b2a40']} position={[0, -1, 0]} />
      </Canvas>
      {/* live / simulated / frozen badge */}
      <TwinBadge live={live} frozen={frozen} />
      {/* numeric orientation readout */}
      {e && (
        <div style={{ position: 'absolute', left: 10, bottom: 10, ...mono, fontSize: 11, color: 'rgba(231,237,247,.8)', lineHeight: 1.6 }}>
          <div>roll {e.roll.toFixed(0)}° · pitch {e.pitch.toFixed(0)}°{e.yaw != null ? ` · yaw ${e.yaw.toFixed(0)}°` : ''}</div>
          {imu?.gx != null && <div style={{ color: 'rgba(231,237,247,.5)' }}>gyro {fmt(imu.gx)} {fmt(imu.gy)} {fmt(imu.gz)} °/s</div>}
        </div>
      )}
    </div>
  )
}

// human-readable Euler (deg) from whatever the device emitted, for the readout
function eulerFromImu(imu) {
  if (imu.euler) return imu.euler
  const q = targetQuat(imu)
  const e = new THREE.Euler().setFromQuaternion(q, 'YXZ')
  return { roll: THREE.MathUtils.radToDeg(e.z), pitch: THREE.MathUtils.radToDeg(e.x), yaw: THREE.MathUtils.radToDeg(e.y) }
}
const fmt = (v) => (v == null ? '—' : Number(v).toFixed(1))

// ── BMP280 twin: gauges + sparkline ─────────────────────────────────
function Gauge({ label, value, unit, min, max, color }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(1, (value - min) / (max - min)))
  const r = 34, c = 2 * Math.PI * r, dash = c * 0.75 // 270° arc
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
      <svg viewBox="0 0 100 90" width="118" height="106">
        <g transform="rotate(135 50 50)">
          <circle cx="50" cy="50" r={r} fill="none" stroke="var(--rule)" strokeWidth="9" strokeDasharray={`${dash} ${c}`} strokeLinecap="round" />
          <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="9" strokeDasharray={`${dash * pct} ${c}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray .4s ease' }} />
        </g>
        <text x="50" y="48" textAnchor="middle" fontSize="17" fontWeight="700" fill="var(--ink)">{value == null ? '—' : value.toFixed(1)}</text>
        <text x="50" y="62" textAnchor="middle" style={mono} fontSize="8" fill="var(--ink4)">{unit}</text>
      </svg>
      <span style={{ ...mono, fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink4)' }}>{label}</span>
    </div>
  )
}

function Sparkline({ data, color }) {
  if (data.length < 2) return <div style={{ height: 38 }} />
  const min = Math.min(...data), max = Math.max(...data), span = max - min || 1
  const w = 240, h = 38
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / span) * (h - 4) - 2}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" />
    </svg>
  )
}

function BmpTwin({ reading, live, frozen }) {
  const [hist, setHist] = useState({ t: [], p: [] })
  const parsed = useMemo(() => parseReading(reading), [reading])
  useEffect(() => {
    if (frozen || parsed.temp == null) return
    setHist(h => ({ t: [...h.t, parsed.temp].slice(-40), p: [...h.p, parsed.pres].slice(-40) }))
  }, [reading, frozen, parsed.temp, parsed.pres])

  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 220, borderRadius: 8, border: '1px solid var(--rule)', background: 'var(--paper2)', padding: '14px 14px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <TwinBadge live={live} frozen={frozen} />
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <Gauge label="temperatura" value={parsed.temp} unit="°C" min={-40} max={85} color="var(--warn2)" />
        <Gauge label="pressão" value={parsed.pres} unit="hPa" min={300} max={1100} color="var(--acc)" />
      </div>
      <div style={{ marginTop: 'auto' }}>
        <div style={{ ...mono, fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 2 }}>histórico</div>
        <Sparkline data={hist.t} color="var(--warn2)" />
        <Sparkline data={hist.p} color="var(--acc)" />
      </div>
    </div>
  )
}
function parseReading(reading) {
  if (!reading) return { temp: null, pres: null }
  const m = reading.match(/(-?[\d.]+)\s*°?C[^\d-]*(-?[\d.]+)/)
  return m ? { temp: +m[1], pres: +m[2] } : { temp: null, pres: null }
}

function TwinBadge({ live, frozen }) {
  const cfg = frozen
    ? { label: 'congelado · desconectado', color: 'var(--err2)', pulse: false }
    : live
      ? { label: 'ao vivo · hardware', color: 'var(--ok2)', pulse: true }
      : { label: 'simulado', color: 'var(--warn2)', pulse: false }
  return (
    <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', alignItems: 'center', gap: 7, padding: '4px 9px', borderRadius: 14, background: 'rgba(12,20,30,.55)', backdropFilter: 'blur(2px)' }}>
      <span className={cfg.pulse ? 'pulse' : ''} style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color, boxShadow: cfg.pulse ? `0 0 6px ${cfg.color}` : 'none' }} />
      <span style={{ ...mono, fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: '#E7EDF7' }}>{cfg.label}</span>
    </div>
  )
}

export default function DigitalTwin({ sensorId }) {
  const fw = useForge(s => s.fw)
  const connected = fw.connected
  const imu = fw.hw.imu
  const reading = fw.reading
  // re-render on a timer so freeze detection + sim animation stay current
  const [, tick] = useState(0)
  useEffect(() => { const id = setInterval(() => tick(t => t + 1), 250); return () => clearInterval(id) }, [])

  const lastAt = sensorId === 'mpu6050' ? imu?.at : fw.hw.lastReadAt
  const fresh = lastAt != null && (Date.now() - lastAt) < STALE_MS
  const live = connected && fresh
  const frozen = connected && lastAt != null && !fresh   // had data, link/stream stalled

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '10px 12px', gap: 8 }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Gêmeo digital</span>
        <span style={{ ...mono, fontSize: 11, color: 'var(--ink4)' }}>
          {sensorId === 'mpu6050' ? 'MPU6050 · orientação ao vivo' : 'BMP280 · temperatura e pressão'}
        </span>
      </div>
      {sensorId === 'mpu6050'
        ? <MpuTwin imu={live || frozen ? imu : null} live={live} frozen={frozen} />
        : <BmpTwin reading={live || frozen ? reading : null} live={live} frozen={frozen} />}
      <div style={{ flexShrink: 0, ...mono, fontSize: 10.5, color: 'var(--ink4)', lineHeight: 1.5 }}>
        {live
          ? 'Espelhando o hardware físico em tempo real pela serial.'
          : frozen
            ? 'Sem dados recentes — exibindo o último estado conhecido (congelado).'
            : 'Sem enlace físico — animação de demonstração. Conecte o ESP32 na aba Firmware.'}
      </div>
    </div>
  )
}
