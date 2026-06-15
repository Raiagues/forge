import { useEffect, useRef } from 'react'
import useForge from './store/useForge'
import IconSidebar from './components/sidebar/IconSidebar'
import Topbar      from './components/panels/Topbar'
import Drawer      from './components/panels/Drawer'
import MissionWindow from './components/panels/MissionWindow'
import HardwareSection from './components/panels/HardwareSection'
import TelemetryPanel from './components/panels/TelemetryPanel'
import HardwareTestPanel from './components/panels/HardwareTestPanel'
import ArchitecturePanel from './components/panels/ArchitecturePanel'
import EmptyState  from './components/panels/EmptyState'
import SerialTest from './components/panels/SerialTest'
import PipelineBar from './components/panels/PipelineBar'
import SchedulePanel from './components/panels/SchedulePanel'
import RequirementsChecklist from './components/ui/RequirementsChecklist'
import AnalyticsPanel from './components/panels/AnalyticsPanel'
import AnchoredPopover from './components/ui/AnchoredPopover'
import AssistantChat from './components/ui/AssistantChat'
import Onboarding from './components/onboarding/Onboarding'
import AssemblyTransition from './components/onboarding/AssemblyTransition'
import PhaseReview from './components/panels/PhaseReview'
import TeamPanel from './components/panels/TeamPanel'
import ReportsPanel from './components/panels/ReportsPanel'
import MetricsPanel from './components/panels/MetricsPanel'
import MissionSummary from './components/panels/MissionSummary'
import * as session from './lib/session.js'

// Section → main-area content. Every section resolves to a real view.
function SectionContent({ section }) {
  switch (section) {
    case 'mission':      return <MissionWindow />
    case 'hardware':     return <HardwareSection />
    case 'hwtest':       return <HardwareTestPanel />
    case 'architecture': return <ArchitecturePanel />
    case 'telemetry':    return <TelemetryPanel />
    case 'serialtest':   return <SerialTest />
    case 'schedule':     return <SchedulePanel />
    case 'team':         return <TeamPanel />
    case 'reports':      return <ReportsPanel />
    case 'metrics':      return <MetricsPanel />
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
    const id = setTimeout(clearNotice, 3000)
    return () => clearTimeout(id)
  }, [notice, clearNotice])
  if (!notice) return null
  return (
    <div style={{
      position: 'absolute', bottom: 36, right: 18,
      background: 'var(--navy)', color: 'rgba(255,255,255,.85)',
      padding: '6px 16px', borderRadius: 18, zIndex: 90, pointerEvents: 'none',
      fontFamily: "'Space Mono', monospace", fontSize: 12, letterSpacing: '.06em',
      boxShadow: '0 4px 14px rgba(26,24,20,.18)', whiteSpace: 'nowrap',
    }}>{notice.message}</div>
  )
}

// Public read-only share page: ?share=<token> renders the standalone
// mission summary with no workspace chrome.
const SHARE_TOKEN = (() => { try { return new URLSearchParams(window.location.search).get('share') } catch { return null } })()

export default function App() {
  const activeSection = useForge(s => s.activeSection)
  const simulateTick  = useForge(s => s.simulateTick)

  // collaboration / multi-project slices for the additive backend pass
  const role = useForge(s => s.auth.role)
  const user = useForge(s => s.auth.user)
  const activeProjectId = useForge(s => s.activeProjectId)
  const reports = useForge(s => s.reports)
  const phaseState = useForge(s => s.phaseState)
  const missionPlan = useForge(s => s.missionPlan)
  const entities = useForge(s => s.entities)
  const wires = useForge(s => s.wires)
  const schedule = useForge(s => s.schedule)
  const hwtest = useForge(s => s.hwtest)
  const lastSyncAt = useForge(s => s.presence.lastSyncAt)
  const filedRef = useRef(new Set())

  // restore a backend session on boot (no-op when there is no backend)
  useEffect(() => { if (!SHARE_TOKEN) session.bootSession() }, [])

  // global telemetry heartbeat
  useEffect(() => {
    const id = setInterval(simulateTick, 3000)
    return () => clearInterval(id)
  }, [simulateTick])

  // debounced real-time sync: push shared design edits to collaborators.
  // Managers sync the whole mission; assigned members sync their scoped
  // work. The lastSyncAt guard suppresses echoes from remote applies +
  // the initial project hydrate, so there is no feedback loop.
  useEffect(() => {
    if (!user || !activeProjectId) return
    if (lastSyncAt && Date.now() - lastSyncAt < 1200) return
    const canSync = role === 'manager' || !!useForge.getState().auth.subsystem
    if (!canSync) return
    const t = setTimeout(() => session.saveShared({ scoped: role !== 'manager', broadcastOnly: true }), 700)
    return () => clearTimeout(t)
  }, [user, activeProjectId, role, lastSyncAt, missionPlan, entities, wires, phaseState, schedule, hwtest])

  // auto-file a backend phase report when a phase is confirmed (item 14/A7)
  useEffect(() => { filedRef.current = new Set() }, [activeProjectId])
  useEffect(() => {
    if (!user || !activeProjectId) return
    const have = new Set(reports.map(r => r.phaseId))
    for (const [pid, ps] of Object.entries(phaseState)) {
      if (ps?.confirmed && !have.has(pid) && !filedRef.current.has(pid)) {
        filedRef.current.add(pid)
        session.fileReport({ phaseId: pid, summary: '', confirmedAt: ps.confirmedAt })
      }
    }
  }, [phaseState, reports, user, activeProjectId])

  // presence: tell collaborators which section the user is viewing
  useEffect(() => { if (user && activeProjectId) session.pushActivity({ section: activeSection }) }, [activeSection, user, activeProjectId])

  // deep link: ?section=telemetry opens a section directly (also used
  // by dev/user-testing). A deep link implies the user knows the app,
  // so the first-visit onboarding overlay is bypassed.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const wanted = params.get('section')
    if (wanted) useForge.setState({ activeSection: wanted, onboarding: null })
    const theme = params.get('theme')          // ?theme=dark|light (dev/testing)
    if (theme === 'dark' || theme === 'light') useForge.getState().setTheme(theme)
  }, [])

  if (SHARE_TOKEN) return <MissionSummary token={SHARE_TOKEN} />

  return (
    <>
      <div style={{ display: 'flex', height: '100vh', position: 'relative', zIndex: 1 }}>
        <IconSidebar />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', minWidth: 0 }}>
          <Topbar />
          <PipelineBar />
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <SectionContent section={activeSection} />
            <Drawer />
            <RequirementsChecklist />
            <Toast />
          </div>
        </div>
      </div>
      <Onboarding />
      <AssemblyTransition />
      <PhaseReview />
      <AnchoredPopover />
      <AssistantChat />
    </>
  )
}
