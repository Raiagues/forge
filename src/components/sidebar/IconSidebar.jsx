import useForge, { SECTIONS, STATUS } from '../../store/useForge'
import { track } from '../../lib/analytics.js'

const ICONS = {
  target:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  grid:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
  cpu:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="2" x2="9" y2="4"/><line x1="15" y1="2" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="22"/><line x1="15" y1="20" x2="15" y2="22"/><line x1="20" y1="9" x2="22" y2="9"/><line x1="20" y1="14" x2="22" y2="14"/><line x1="2" y1="9" x2="4" y2="9"/><line x1="2" y1="14" x2="4" y2="14"/></svg>,
  code:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
  bug:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2l1.88 1.88"/><path d="M14.12 3.88L16 2"/><path d="M9 7.13v-1a3.003 3.003 0 116 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 014-4h4a4 4 0 014 4v3c0 3.3-2.7 6-6 6z"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 4-4"/><path d="M17.47 9c1.93-.2 3.53-1.9 3.53-4"/><path d="M18 13h4"/><path d="M21 21c0-2.1-1.7-3.9-4-4"/></svg>,
  terminal: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>,
  activity: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  lab:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2h6"/><path d="M10 2v6.5L5 18a2 2 0 001.8 3h10.4A2 2 0 0019 18l-5-9.5V2"/><line x1="7.5" y1="14" x2="16.5" y2="14"/></svg>,
  settings: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  sun:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>,
  moon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>,
}

// build-sequence completion per section, derived from store state
function sectionProgress({ missionPlan: mp, entities, live, telemetry }) {
  const ents = Object.keys(entities).length
  const wiredAll = ents > 0 && Object.keys(entities).every(id => live?.wiring?.[id]?.wired)
  const missionDone = !!mp.frameworkId && !!mp.objectiveId && (mp.name?.trim().length >= 2)
  const missionPartial = !!mp.frameworkId || !!mp.objectiveId
  return {
    mission:    missionDone ? 'done' : missionPartial ? 'partial' : 'todo',
    hardware:   ents >= 2 ? 'done' : ents >= 1 ? 'partial' : 'todo',
    serialtest: wiredAll ? 'done' : ents >= 1 ? 'partial' : 'todo',
    debug:      ents >= 1 ? 'partial' : 'todo',
    telemetry:  telemetry.length > 0 ? 'done' : ents >= 2 ? 'partial' : 'todo',
  }
}

export default function IconSidebar() {
  const { activeSection, setSection, entities, live, missionPlan, telemetry, showPopover, theme, toggleTheme } = useForge()

  // issue indicator: live validation first, entity status as fallback
  const list = Object.values(entities)
  const v = live?.validation
  const hasErr = (v?.summary.errors > 0 && list.length > 0) || list.some(e => e.status === STATUS.ERR)
  const hasWarn = (v?.summary.warnings > 0 && list.length > 0) || list.some(e => e.status === STATUS.WARN)
  const issueLevel = hasErr ? 'err' : hasWarn ? 'warn' : null
  const ISSUE_SECTIONS = { architecture: issueLevel, debug: issueLevel }

  const prog = sectionProgress({ missionPlan, entities, live, telemetry })

  // user-testing mode (VITE_USER_TEST=1 ./start.sh): hide developer-facing
  // sections from the rail so testers see only the product workflow
  const userTest = import.meta.env?.VITE_USER_TEST === '1'
  const visibleSections = userTest ? SECTIONS.filter(s => s.id !== 'serialtest') : SECTIONS

  // Mission (define WHAT) and Hardware (define HOW) are always open;
  // the downstream sections need hardware on the board to mean anything.
  const hwStageDone = list.length >= 2
  const FREE = ['mission', 'hardware']
  const clickSection = (id, anchorEl) => {
    if (!FREE.includes(id) && !hwStageDone) {
      // anchored feedback right at the icon — a corner toast was missed
      showPopover({
        anchorEl,
        message: 'Esta área abre depois que a missão tiver hardware na placa.',
        hint: 'defina a missão em Mission e escolha os componentes em Hardware',
      })
      return
    }
    setSection(id)
  }

  return (
    <aside style={{
      width: 48, flexShrink: 0,
      background: 'var(--rail-bg)',
      borderRight: '1px solid var(--rule2)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', padding: '10px 0', zIndex: 20,
    }}>
      {/* logo */}
      <div style={{
        fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700,
        color: 'var(--rail-fg)', letterSpacing: '.1em',
        padding: '6px 0 12px', borderBottom: '1px solid var(--rail-line)',
        width: '100%', textAlign: 'center', marginBottom: 8,
      }}>FG</div>

      {/* build-sequence pipeline: connected nodes, each carrying its stage's
          progress (done / partial / to-do). Click navigates; gated stages
          answer with an anchored popover. */}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9, width: '100%' }}>
        <div style={{ position: 'absolute', top: 15, bottom: 15, width: 2, left: '50%', transform: 'translateX(-50%)', background: 'var(--rail-line)', zIndex: 0 }} />
        {visibleSections.map(sec => {
          const active = activeSection === sec.id
          const p = prog[sec.id] || 'todo'
          const issue = ISSUE_SECTIONS[sec.id]
          const done = p === 'done', partial = p === 'partial'
          return (
            <button
              key={sec.id}
              title={`${sec.label}${done ? ' · concluído' : partial ? ' · em andamento' : ''}`}
              onClick={(e) => clickSection(sec.id, e.currentTarget)}
              style={{
                position: 'relative', zIndex: 1, width: 30, height: 30, borderRadius: '50%',
                border: done ? 'none' : `1.5px solid ${partial ? 'var(--rail-active-fg)' : 'var(--rail-line)'}`,
                background: done ? 'var(--rail-active-fg)' : 'var(--rail-bg)',
                boxShadow: active ? '0 0 0 2px var(--rail-active-bg)' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', transition: 'all .15s',
              }}
            >
              <span style={{
                display: 'block', width: 17, height: 17,
                color: done ? 'var(--rail-bg)' : partial ? 'var(--rail-active-fg)' : active ? 'var(--rail-fg)' : 'var(--rail-fg-dim)',
                transition: 'color .15s',
              }}>
                {ICONS[sec.icon]}
              </span>
              {issue && (
                <span style={{
                  position: 'absolute', top: -1, right: -1,
                  width: 7, height: 7, borderRadius: '50%',
                  background: issue === 'err' ? 'var(--err2)' : 'var(--warn2)',
                  border: '1.5px solid var(--rail-bg)',
                }} />
              )}
            </button>
          )
        })}
      </div>

      <div style={{ flex: 1 }} />

      {/* theme toggle — light (paper) ⇄ dark (navy), persisted */}
      <button
        title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
        onClick={toggleTheme}
        style={{
          width: 36, height: 36, borderRadius: 6, border: 'none', background: 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          color: 'var(--rail-fg)',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--rail-hover)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
      >
        <span style={{ display: 'block', width: 20, height: 20 }}>{theme === 'dark' ? ICONS.sun : ICONS.moon}</span>
      </button>

      {/* gear → developer analytics view (user-testing instrumentation) */}
      <button
        title="Analytics (dev)"
        onClick={() => { track('analytics_open'); setSection('analytics') }}
        style={{
          width: 36, height: 36, borderRadius: 6, border: 'none',
          background: activeSection === 'analytics' ? 'var(--rail-active-bg)' : 'transparent',
          display: 'flex', alignItems: 'center',
          justifyContent: 'center', cursor: 'pointer',
          color: activeSection === 'analytics' ? 'var(--rail-active-fg)' : 'var(--rail-fg)',
        }}
        onMouseEnter={e => { if (activeSection !== 'analytics') e.currentTarget.style.background = 'var(--rail-hover)' }}
        onMouseLeave={e => { if (activeSection !== 'analytics') e.currentTarget.style.background = 'transparent' }}
      >
        <span style={{ display: 'block', width: 20, height: 20 }}>{ICONS.settings}</span>
      </button>
    </aside>
  )
}
