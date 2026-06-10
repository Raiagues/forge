import { useEffect } from 'react'
import useForge from './store/useForge'
import IconSidebar from './components/sidebar/IconSidebar'
import NavPanel    from './components/sidebar/NavPanel'
import Topbar      from './components/panels/Topbar'
import Statusbar   from './components/panels/Statusbar'
import Drawer      from './components/panels/Drawer'
import MissionSection from './components/panels/MissionSection'
import TelemetryPanel from './components/panels/TelemetryPanel'
import FirmwarePanel  from './components/panels/FirmwarePanel'
import DebugPanel     from './components/panels/DebugPanel'
import ArchitecturePanel from './components/panels/ArchitecturePanel'
import EmptyState  from './components/panels/EmptyState'
import HardwareViews from './components/canvas/HardwareViews'
import SerialTest from './components/panels/SerialTest'
import FeatureInfoModal from './components/panels/FeatureInfoModal'
import AnalyticsPanel from './components/panels/AnalyticsPanel'

function HardwareSection({ section, hasEntities }) {
  if (!hasEntities) return <EmptyState section={section} />
  return <HardwareViews />
}

// Section → main-area content. Every section resolves to a real view.
function SectionContent({ section, hasEntities }) {
  switch (section) {
    case 'mission':      return <MissionSection />
    case 'hardware':     return <HardwareSection section="Hardware" hasEntities={hasEntities} />
    case 'debug':        return <DebugPanel />
    case 'architecture': return <ArchitecturePanel />
    case 'firmware':     return <FirmwarePanel />
    case 'telemetry':    return <TelemetryPanel />
    case 'serialtest':   return <SerialTest />
    case 'analytics':    return <AnalyticsPanel />
    default:             return <EmptyState section={section} />
  }
}

// Lightweight contextual toast — fed by store.notice (e.g. "em breve",
// hardware added). Auto-dismisses; never interrupts the flow.
function Toast() {
  const notice = useForge(s => s.notice)
  const clearNotice = useForge(s => s.clearNotice)
  useEffect(() => {
    if (!notice) return
    const id = setTimeout(clearNotice, 2200)
    return () => clearTimeout(id)
  }, [notice, clearNotice])
  if (!notice) return null
  return (
    <div style={{
      position: 'absolute', bottom: 38, left: '50%', transform: 'translateX(-50%)',
      background: 'var(--navy)', color: 'rgba(255,255,255,.85)',
      padding: '6px 16px', borderRadius: 18, zIndex: 90, pointerEvents: 'none',
      fontFamily: "'Space Mono', monospace", fontSize: 9.5, letterSpacing: '.06em',
      boxShadow: '0 4px 14px rgba(26,24,20,.18)', whiteSpace: 'nowrap',
    }}>{notice.message}</div>
  )
}

export default function App() {
  const activeSection = useForge(s => s.activeSection)
  const simulateTick  = useForge(s => s.simulateTick)
  const hasEntities   = useForge(s => Object.keys(s.entities).length > 0)

  // global telemetry heartbeat
  useEffect(() => {
    const id = setInterval(simulateTick, 3000)
    return () => clearInterval(id)
  }, [simulateTick])

  return (
    <>
      <div className="paper-grid" />
      <div style={{ display: 'flex', height: '100vh', position: 'relative', zIndex: 1 }}>
        <IconSidebar />
        <NavPanel />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', minWidth: 0 }}>
          <Topbar />
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <SectionContent section={activeSection} hasEntities={hasEntities} />
            <Drawer />
            <FeatureInfoModal />
            <Toast />
          </div>
          <Statusbar />
        </div>
      </div>
    </>
  )
}
