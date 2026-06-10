import useForge, { STATUS } from '../../store/useForge'

export default function Topbar() {
  const { activeSection, entities, isScanning, runScan } = useForge()

  const errCount  = Object.values(entities).filter(e => e.status === STATUS.ERR).length
  const warnCount = Object.values(entities).filter(e => e.status === STATUS.WARN).length

  const sectionLabels = {
    mission: 'Mission', architecture: 'Architecture',
    hardware: 'Hardware', firmware: 'Firmware',
    debug: 'Debug', serial: 'Serial Monitor', telemetry: 'Telemetry',
    serialtest: 'Serial Test',
  }

  return (
    <div style={{
      height: 40, flexShrink: 0,
      background: 'var(--paper2)',
      borderBottom: '1px solid var(--rule)',
      display: 'flex', alignItems: 'center',
      padding: '0 14px', gap: 10,
    }}>
      <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink3)' }}>Sistema</span>
      <span style={{ color: 'var(--ink4)', fontSize: 11 }}>›</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{sectionLabels[activeSection] || activeSection}</span>

      <div style={{ flex: 1 }} />

      {/* status pills */}
      {errCount > 0 && (
        <span className="badge badge-err">{errCount} erro{errCount > 1 ? 's' : ''}</span>
      )}
      {warnCount > 0 && (
        <span className="badge badge-warn">{warnCount} aviso{warnCount > 1 ? 's' : ''}</span>
      )}

      {/* I2C scan */}
      {activeSection === 'hardware' && (
        <button
          onClick={runScan}
          disabled={isScanning}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 4,
            border: '1px solid var(--rule)',
            background: 'var(--paper)',
            fontFamily: "'Space Mono', monospace", fontSize: 9,
            letterSpacing: '.08em', textTransform: 'uppercase',
            color: isScanning ? 'var(--acc2)' : 'var(--ink3)',
            cursor: isScanning ? 'default' : 'pointer',
            transition: 'all .15s',
          }}
        >
          {isScanning ? (
            <>
              <span style={{ display: 'block', width: 10, height: 10, border: '1.5px solid var(--acc2)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
              Scanning...
            </>
          ) : (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              I2C Scan
            </>
          )}
        </button>
      )}
    </div>
  )
}
