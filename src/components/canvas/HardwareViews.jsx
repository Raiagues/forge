import { Suspense } from 'react'
import useForge from '../../store/useForge'
import ForgeCanvas from './ForgeCanvas'
import SchematicView from './SchematicView'

// ──────────────────────────────────────────────────────────────────
// HardwareViews — 3D spatial board ↔ 2D schematic, same hardware
// graph and state underneath. The toggle persists in the store so the
// choice carries across sections (Mission center, Hardware, Debug).
// ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: "'Space Mono', monospace" }

export function ViewToggle({ style }) {
  const { hardwareView, setHardwareView } = useForge()
  return (
    <div style={{ display: 'flex', gap: 0, border: '1px solid var(--rule)', borderRadius: 4, overflow: 'hidden', ...style }}>
      {['3d', '2d'].map(v => (
        <button key={v} onClick={() => setHardwareView(v)} style={{
          padding: '3px 11px', border: 'none', cursor: 'pointer',
          ...mono, fontSize: 8.5, letterSpacing: '.08em', textTransform: 'uppercase',
          background: hardwareView === v ? 'var(--navy)' : 'var(--paper2)',
          color: hardwareView === v ? 'rgba(255,255,255,.85)' : 'var(--ink3)',
        }}>{v === '3d' ? '3D placa' : '2D esquema'}</button>
      ))}
    </div>
  )
}

export default function HardwareViews({ showToggle = true }) {
  const hardwareView = useForge(s => s.hardwareView)
  return (
    <div style={{ height: '100%', position: 'relative' }}>
      {hardwareView === '2d' ? (
        <SchematicView />
      ) : (
        <Suspense fallback={
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ ...mono, fontSize: 10, color: 'var(--ink4)', letterSpacing: '.1em' }}>carregando cena 3D…</span>
          </div>
        }>
          <ForgeCanvas />
        </Suspense>
      )}
      {showToggle && (
        <div style={{ position: 'absolute', top: 8, right: 10, zIndex: 12 }}>
          <ViewToggle />
        </div>
      )}
    </div>
  )
}
