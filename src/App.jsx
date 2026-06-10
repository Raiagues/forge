import { useEffect, Suspense } from 'react'
import useForge from './store/useForge'
import IconSidebar from './components/sidebar/IconSidebar'
import NavPanel    from './components/sidebar/NavPanel'
import Topbar      from './components/panels/Topbar'
import Statusbar   from './components/panels/Statusbar'
import Drawer      from './components/panels/Drawer'
import MissionSection from './components/panels/MissionSection'
import TelemetryPanel from './components/panels/TelemetryPanel'
import SerialPanel    from './components/panels/SerialPanel'
import FirmwarePanel  from './components/panels/FirmwarePanel'
import ArchitecturePanel from './components/panels/ArchitecturePanel'
import EmptyState  from './components/panels/EmptyState'
import ForgeCanvas from './components/canvas/ForgeCanvas'
import SerialTest from './components/panels/SerialTest'

function CanvasView({ section, hasEntities }) {
  if (!hasEntities) return <EmptyState section={section} />
  return (
    <Suspense fallback={
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: 'var(--ink4)', letterSpacing: '.1em' }}>
          carregando cena 3D…
        </span>
      </div>
    }>
      <ForgeCanvas />
    </Suspense>
  )
}

// Section → main-area content. Every section resolves to a real view.
function SectionContent({ section, hasEntities }) {
  switch (section) {
    case 'mission':      return <MissionSection />
    case 'hardware':     return <CanvasView section="Hardware" hasEntities={hasEntities} />
    case 'debug':        return <CanvasView section="Debug" hasEntities={hasEntities} />
    case 'architecture': return <ArchitecturePanel />
    case 'firmware':     return <FirmwarePanel />
    case 'serial':       return <SerialPanel />
    case 'telemetry':    return <TelemetryPanel />
    case 'serialtest':   return <SerialTest />
    default:             return <EmptyState section={section} />
  }
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
          </div>
          <Statusbar />
        </div>
      </div>
    </>
  )
}
