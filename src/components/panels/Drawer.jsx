import { useEffect, useRef } from 'react'
import useForge from '../../store/useForge'

// ──────────────────────────────────────────────────────────────────
// Drawer — minimal sensor inspector. Shows only: name, model, I2C
// address, operating voltage, the connection state (only when the
// sensor is actually wired) and a simulated telemetry sparkline (only
// when wired). Nothing else.
// ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: "'Space Mono', monospace" }

// Tiny inline sparkline for the telemetry preview — no chart lib.
function MiniSpark({ data, color }) {
  const pts = data.filter(v => v != null)
  if (pts.length < 2) return <span style={{ ...mono, fontSize: 12, color: 'var(--ink4)' }}>aguardando amostras…</span>
  const W = 250, H = 38, pad = 3
  const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1
  const step = (W - pad * 2) / (pts.length - 1)
  const d = pts.map((v, i) =>
    `${i ? 'L' : 'M'}${(pad + i * step).toFixed(1)},${(H - pad - ((v - min) / span) * (H - pad * 2)).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: 'block' }}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function PropRow({ label, value, badge }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--rule2)' }}>
      <span style={{ fontSize: 13.5, color: 'var(--ink3)' }}>{label}</span>
      {badge
        ? <span className={`badge badge-${badge}`}>{value}</span>
        : <span style={{ ...mono, fontSize: 13.5, color: 'var(--ink)' }}>{value}</span>}
    </div>
  )
}

function Section({ label, children }) {
  return (
    <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--rule)' }}>
      <div style={{ ...mono, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 8 }}>{label}</div>
      {children}
    </div>
  )
}

export default function Drawer() {
  const { drawerOpen, selectedId, entities, closeDrawer } = useForge()
  const entity = selectedId ? entities[selectedId] : null
  const scrollRef = useRef()

  // reset scroll on new selection
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [selectedId])

  const W = 300

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0,
      width: W, background: 'var(--paper)',
      borderLeft: '1px solid var(--rule)',
      transform: drawerOpen ? 'translateX(0)' : `translateX(${W}px)`,
      transition: 'transform .25s cubic-bezier(.4,0,.2,1)',
      zIndex: 30, display: 'flex', flexDirection: 'column',
      boxShadow: drawerOpen ? '-6px 0 20px rgba(26,24,20,.07)' : 'none',
    }}>
      {entity ? <EntityContent entity={entity} id={selectedId} onClose={closeDrawer} scrollRef={scrollRef} /> : null}
    </div>
  )
}

function EntityContent({ entity, id, onClose, scrollRef }) {
  const { def } = entity
  const { live, telemetry } = useForge()
  const isWired = !!live?.wiring?.[id]?.wired

  // simulated telemetry series for this component
  const sparks = id === 'bmp280'
    ? [{ key: 'press', label: 'Pressão (hPa)', color: 'var(--acc2)' }, { key: 'temp', label: 'Temperatura (°C)', color: 'var(--err2)' }]
    : id === 'mpu6050'
      ? [{ key: 'accel', label: 'Aceleração Z (g)', color: 'var(--warn2)' }]
      : id === 'esp32'
        ? [{ key: 'heap', label: 'Heap livre (kB)', color: 'var(--ok2)' }]
        : []

  return (
    <>
      {/* header — name + model */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'flex-start', gap: 10, flexShrink: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {def.friendly || def.label}
          </div>
          <div style={{ ...mono, fontSize: 12, color: 'var(--ink3)', letterSpacing: '.06em' }}>{def.label}</div>
        </div>
        <button onClick={onClose} style={{
          width: 24, height: 24, borderRadius: 4, border: '1px solid var(--rule)', background: 'var(--paper2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--ink3)', fontSize: 14,
        }}>×</button>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto' }}>
        <Section label="Propriedades">
          {def.address && <PropRow label="Endereço I2C" value={def.address} />}
          <PropRow label="Tensão de operação" value={def.voltage} />
          {isWired && <PropRow label="Conexão" value="conectado" badge="ok" />}
        </Section>

        {isWired && sparks.length > 0 && (
          <Section label="Leituras · simulação">
            {sparks.map(s => (
              <div key={s.key} style={{ marginBottom: 10 }}>
                <div style={{ ...mono, fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 3 }}>{s.label}</div>
                <MiniSpark data={telemetry.map(t => t[s.key])} color={s.color} />
              </div>
            ))}
          </Section>
        )}
      </div>
    </>
  )
}
