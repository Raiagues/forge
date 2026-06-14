import useForge from '../../store/useForge'

export default function Topbar() {
  const activeSection = useForge(s => s.activeSection)

  const sectionLabels = {
    mission: 'Mission', hardware: 'Hardware', architecture: 'Architecture',
    telemetry: 'Telemetry',
    serialtest: 'Firmware', hwtest: 'Testing',
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
    </div>
  )
}
