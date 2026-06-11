import useForge, { STATUS } from '../../store/useForge'

export default function Topbar() {
  const { activeSection, entities } = useForge()

  const errCount  = Object.values(entities).filter(e => e.status === STATUS.ERR).length
  const warnCount = Object.values(entities).filter(e => e.status === STATUS.WARN).length

  const sectionLabels = {
    mission: 'Mission', architecture: 'Architecture',
    debug: 'Debug', telemetry: 'Telemetry',
    serialtest: 'Serial Test',
    analytics: 'Analytics · dev',
  }

  return (
    <div style={{
      height: 40, flexShrink: 0,
      background: 'var(--paper2)',
      borderBottom: '1px solid var(--rule)',
      display: 'flex', alignItems: 'center',
      padding: '0 14px', gap: 10,
    }}>
      <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink3)' }}>Sistema</span>
      <span style={{ color: 'var(--ink4)', fontSize: 13.5 }}>›</span>
      <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>{sectionLabels[activeSection] || activeSection}</span>

      <div style={{ flex: 1 }} />

      {/* status pills */}
      {errCount > 0 && (
        <span className="badge badge-err">{errCount} erro{errCount > 1 ? 's' : ''}</span>
      )}
      {warnCount > 0 && (
        <span className="badge badge-warn">{warnCount} aviso{warnCount > 1 ? 's' : ''}</span>
      )}

    </div>
  )
}
