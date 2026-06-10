import { useEffect } from 'react'
import useForge, { SECTIONS, STATUS } from '../../store/useForge'
import { track } from '../../lib/analytics.js'

const ICONS = {
  target:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  grid:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
  cpu:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="2" x2="9" y2="4"/><line x1="15" y1="2" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="22"/><line x1="15" y1="20" x2="15" y2="22"/><line x1="20" y1="9" x2="22" y2="9"/><line x1="20" y1="14" x2="22" y2="14"/><line x1="2" y1="9" x2="4" y2="9"/><line x1="2" y1="14" x2="4" y2="14"/></svg>,
  code:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
  bug:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2l1.88 1.88"/><path d="M14.12 3.88L16 2"/><path d="M9 7.13v-1a3.003 3.003 0 116 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 014-4h4a4 4 0 014 4v3c0 3.3-2.7 6-6 6z"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 4-4"/><path d="M17.47 9c1.93-.2 3.53-1.9 3.53-4"/><path d="M18 13h4"/><path d="M21 21c0-2.1-1.7-3.9-4-4"/></svg>,
  terminal: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>,
  activity: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  lab:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2h6"/><path d="M10 2v6.5L5 18a2 2 0 001.8 3h10.4A2 2 0 0019 18l-5-9.5V2"/><line x1="7.5" y1="14" x2="16.5" y2="14"/></svg>,
  settings: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
}

export default function IconSidebar() {
  const { activeSection, setSection, entities, live } = useForge()

  // issue indicator: live validation first, entity status as fallback
  const list = Object.values(entities)
  const v = live?.validation
  const hasErr = (v?.summary.errors > 0 && list.length > 0) || list.some(e => e.status === STATUS.ERR)
  const hasWarn = (v?.summary.warnings > 0 && list.length > 0) || list.some(e => e.status === STATUS.WARN)
  const issueLevel = hasErr ? 'err' : hasWarn ? 'warn' : null
  const ISSUE_SECTIONS = { hardware: issueLevel, architecture: issueLevel, debug: issueLevel }

  // user-testing mode (./start_test_user.sh): hide developer-facing
  // sections from the rail so testers see only the product workflow
  const userTest = import.meta.env.VITE_USER_TEST === '1'
  // Architecture/Firmware only exist once the mission's Hardware stage is
  // complete (same rule as the mission flow: at least 2 placed components)
  const hwStageDone = list.length >= 2
  const visibleSections = SECTIONS.filter(s => {
    if (userTest && s.id === 'serialtest') return false
    if (!hwStageDone && (s.id === 'architecture' || s.id === 'firmware')) return false
    return true
  })

  // never leave the app stranded on a section that just became hidden
  useEffect(() => {
    if (!hwStageDone && (activeSection === 'architecture' || activeSection === 'firmware')) setSection('mission')
  }, [hwStageDone, activeSection, setSection])

  return (
    <aside style={{
      width: 48, flexShrink: 0,
      background: 'var(--navy)',
      borderRight: '1px solid rgba(255,255,255,.04)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', padding: '10px 0', gap: 2, zIndex: 20,
    }}>
      {/* logo */}
      <div style={{
        fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700,
        color: 'rgba(255,255,255,.85)', letterSpacing: '.1em',
        padding: '6px 0 12px', borderBottom: '1px solid var(--navyb)',
        width: '100%', textAlign: 'center', marginBottom: 6,
      }}>FG</div>

      {visibleSections.map(sec => {
        const active = activeSection === sec.id
        const issue  = ISSUE_SECTIONS[sec.id]
        return (
          <button
            key={sec.id}
            title={sec.label}
            onClick={() => setSection(sec.id)}
            style={{
              width: 36, height: 36, borderRadius: 6, border: 'none',
              background: active ? 'var(--navyb2)' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', position: 'relative', transition: 'background .15s',
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--navyb)' }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
          >
            <span style={{
              display: 'block', width: 16, height: 16,
              color: active ? 'var(--navyt)' : 'var(--navyt3)',
              transition: 'color .15s',
            }}>
              {ICONS[sec.icon]}
            </span>
            {issue && (
              <span style={{
                position: 'absolute', top: 4, right: 4,
                width: 6, height: 6, borderRadius: '50%',
                background: issue === 'err' ? 'var(--err2)' : 'var(--warn2)',
                border: '1.5px solid var(--navy)',
              }} />
            )}
          </button>
        )
      })}

      <div style={{ flex: 1 }} />

      {/* gear → developer analytics view (user-testing instrumentation) */}
      <button
        title="Analytics (dev)"
        onClick={() => { track('analytics_open'); setSection('analytics') }}
        style={{
          width: 36, height: 36, borderRadius: 6, border: 'none',
          background: activeSection === 'analytics' ? 'var(--navyb2)' : 'transparent',
          display: 'flex', alignItems: 'center',
          justifyContent: 'center', cursor: 'pointer',
          color: activeSection === 'analytics' ? 'var(--navyt)' : 'var(--navyt3)',
        }}
        onMouseEnter={e => { if (activeSection !== 'analytics') e.currentTarget.style.background = 'var(--navyb)' }}
        onMouseLeave={e => { if (activeSection !== 'analytics') e.currentTarget.style.background = 'transparent' }}
      >
        <span style={{ display: 'block', width: 16, height: 16 }}>{ICONS.settings}</span>
      </button>
    </aside>
  )
}
