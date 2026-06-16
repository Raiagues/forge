import { useState } from 'react'
import useForge from '../../store/useForge'
import { PHASES, derivePhases } from '../../mission/index.js'
import { track } from '../../lib/analytics.js'
import BudgetMeters from '../ui/BudgetMeters'
import { ObsatCompact } from './ObsatWidget'

// ──────────────────────────────────────────────────────────────────
// Sidebar — the expandable PHASE navigation (Part 5 of the redesign).
//
// Replaces the unlabelled icon rail. Shows the five build phases
// vertically; each expands to its sub-items. The current phase/sub-item
// is highlighted, completed sub-items show a check and are clickable to
// revisit, and locked future phases are visible but inert. Collapsible to
// an icon-only rail (tooltips with completion summary) for more canvas.
// All phase/sub-item state comes from the shared src/mission/phases.js
// predicate — no duplicated progress logic. The live budget meters dock
// at the bottom of the expanded sidebar.
// ──────────────────────────────────────────────────────────────────

const ICONS = {
  mission:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  hardware: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="2" x2="9" y2="4"/><line x1="15" y1="2" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="22"/><line x1="15" y1="20" x2="15" y2="22"/><line x1="20" y1="9" x2="22" y2="9"/><line x1="20" y1="14" x2="22" y2="14"/><line x1="2" y1="9" x2="4" y2="9"/><line x1="2" y1="14" x2="4" y2="14"/></svg>,
  firmware: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
  testing:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2h6"/><path d="M10 2v6.5L5 18a2 2 0 001.8 3h10.4A2 2 0 0019 18l-5-9.5V2"/><line x1="7.5" y1="14" x2="16.5" y2="14"/></svg>,
  telemetry:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  schedule: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  settings: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  team: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  reports: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>,
  metrics: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  review: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>,
  intel: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  sun:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>,
  moon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>,
  collapse: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>,
  expand: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>,
}

const mono = { fontFamily: "'Space Mono', monospace" }

function Check() {
  return <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
}
function Lock() {
  return <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
}

export default function IconSidebar() {
  const store = useForge()
  const { activeSection, setSection, setHardwareView, setMissionStep, missionStep, hardwareView, theme, toggleTheme, sidebarCollapsed, toggleSidebar, showPopover } = store
  const isManager = store.auth?.role === 'manager'
  const isAdmin = !!store.auth?.user?.isAdmin
  const { status, hwReady } = derivePhases(store)
  const [expanded, setExpanded] = useState(() => ({ [PHASE_BY_ACTIVE(activeSection)]: true }))

  const userTest = import.meta.env?.VITE_USER_TEST === '1'
  const phases = userTest ? PHASES.filter(p => p.section !== 'serialtest') : PHASES

  const goPhase = (p, anchorEl) => {
    if (status[p.id].locked) {
      showPopover({ anchorEl, message: 'Esta fase abre depois que houver hardware na placa.', hint: 'defina a missão e escolha os componentes em Hardware' })
      return
    }
    setSection(p.section)
    if (!sidebarCollapsed) setExpanded(e => ({ ...e, [p.id]: true }))
  }
  const goSub = (p, sub) => {
    if (status[p.id].locked) return
    setSection(p.section)
    if (sub.view) setHardwareView(sub.view)
    if (sub.step) setMissionStep(sub.step)   // jump to that mission-flow step
  }

  // ── collapsed: icon-only rail ────────────────────────────────────
  if (sidebarCollapsed) {
    return (
      <aside style={railStyle()}>
        <div style={{ ...mono, fontSize: 13, fontWeight: 700, color: 'var(--rail-fg)', letterSpacing: '.1em', padding: '6px 0 12px', borderBottom: '1px solid var(--rail-line)', width: '100%', textAlign: 'center', marginBottom: 8 }}>GS</div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: '100%' }}>
          {phases.map(p => {
            const st = status[p.id]
            const subDone = Object.values(st.sub).filter(Boolean).length
            return (
              <button key={p.id} onClick={(e) => goPhase(p, e.currentTarget)}
                title={`${p.label}${st.locked ? ' · bloqueado' : st.done ? ' · concluído' : ` · ${subDone}/${p.sub.length}`}`}
                style={railBtn(st)}>
                <span style={{ display: 'block', width: 17, height: 17 }}>{ICONS[p.id]}</span>
                {st.done && <span style={dotBadge('var(--ok2)')}><Check /></span>}
                {st.locked && <span style={dotBadge('var(--ink4)')}><Lock /></span>}
              </button>
            )
          })}
          <button onClick={() => { track('nav_click', { target: 'team' }); setSection('team') }} title="Equipe & tarefas" style={railBtn({ current: activeSection === 'team' })}>
            <span style={{ display: 'block', width: 17, height: 17 }}>{ICONS.team}</span>
          </button>
          <button onClick={() => { track('nav_click', { target: 'reports' }); setSection('reports') }} title="Relatórios" style={railBtn({ current: activeSection === 'reports' })}>
            <span style={{ display: 'block', width: 17, height: 17 }}>{ICONS.reports}</span>
          </button>
          {isManager && (
            <button onClick={() => { track('nav_click', { target: 'metrics' }); setSection('metrics') }} title="Métricas de autonomia" style={railBtn({ current: activeSection === 'metrics' })}>
              <span style={{ display: 'block', width: 17, height: 17 }}>{ICONS.metrics}</span>
            </button>
          )}
          {isAdmin && (
            <>
              <button onClick={() => { track('nav_click', { target: 'challenge-review' }); setSection('challenge-review') }} title="Fila de revisão de desafios" style={railBtn({ current: activeSection === 'challenge-review' })}>
                <span style={{ display: 'block', width: 17, height: 17 }}>{ICONS.review}</span>
              </button>
              <button onClick={() => { track('nav_click', { target: 'market-intel' }); setSection('market-intel') }} title="Inteligência de mercado" style={railBtn({ current: activeSection === 'market-intel' })}>
                <span style={{ display: 'block', width: 17, height: 17 }}>{ICONS.intel}</span>
              </button>
            </>
          )}
        </div>
        <div style={{ flex: 1 }} />
        <ObsatCompact collapsed />
        <RailFooterButtons {...{ toggleSidebar, sidebarCollapsed, theme, toggleTheme, activeSection, setSection }} />
      </aside>
    )
  }

  // ── expanded: full phase nav ─────────────────────────────────────
  return (
    <aside style={{ width: 232, flexShrink: 0, background: 'var(--rail-bg)', borderRight: '1px solid var(--rule2)', display: 'flex', flexDirection: 'column', zIndex: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px 11px', borderBottom: '1px solid var(--rail-line)' }}>
        <span style={{ ...mono, fontSize: 14, fontWeight: 700, color: 'var(--rail-fg)', letterSpacing: '.14em' }}>GuiaSat</span>
        <span style={{ flex: 1 }} />
        <button onClick={toggleSidebar} title="Recolher" style={iconBtn()}><span style={{ display: 'block', width: 16, height: 16 }}>{ICONS.collapse}</span></button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {phases.map(p => {
          const st = status[p.id]
          const open = !!expanded[p.id] && !st.locked
          const subDone = Object.values(st.sub).filter(Boolean).length
          return (
            <div key={p.id}>
              <button onClick={(e) => { if (st.locked) { goPhase(p, e.currentTarget); return } setExpanded(ex => ({ ...ex, [p.id]: !ex[p.id] })); goPhase(p, e.currentTarget) }}
                style={phaseRow(st)}>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  background: st.done ? 'var(--ok2)' : st.current ? 'var(--rail-active-fg)' : 'transparent',
                  border: st.done || st.current ? 'none' : '1.5px solid var(--rail-line)',
                  color: st.done || st.current ? 'var(--rail-bg)' : st.locked ? 'var(--ink4)' : 'var(--rail-fg-dim)' }}>
                  {st.done ? <Check /> : st.locked ? <Lock /> : <span style={{ display: 'block', width: 13, height: 13 }}>{ICONS[p.id]}</span>}
                </span>
                <span style={{ flex: 1, textAlign: 'left', fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, fontWeight: st.current ? 700 : 500, color: st.locked ? 'var(--ink4)' : 'var(--rail-fg)' }}>{p.label}</span>
                {st.needsUpdate && <span title="atualização necessária — uma etapa anterior mudou" style={{ ...mono, fontSize: 12, color: 'var(--warn2)' }}>⟳</span>}
                <span style={{ ...mono, fontSize: 10, color: 'var(--rail-fg-dim)' }}>{st.locked ? '' : `${subDone}/${p.sub.length}`}</span>
                {!st.locked && <span style={{ ...mono, fontSize: 11, color: 'var(--rail-fg-dim)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>}
              </button>

              <div style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', transition: 'grid-template-rows .22s ease' }}>
                <div style={{ overflow: 'hidden' }}>
                  {p.sub.map(sub => {
                    const done = !!st.sub[sub.id]
                    // current sub-item: same three-state logic at sub level.
                    // We know which sub is active for the steps the store
                    // tracks (mission flow step, hardware 2D/3D view).
                    const cur = st.current && (
                      (p.id === 'mission' && sub.step === missionStep) ||
                      (p.id === 'hardware' && sub.view === hardwareView)
                    )
                    return (
                      <button key={sub.id} onClick={() => goSub(p, sub)} style={subRow(cur)}>
                        <span style={{ width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: done ? 'var(--ok2)' : cur ? 'var(--rail-active-fg)' : 'var(--rail-line)', flexShrink: 0 }}>
                          {done ? <Check /> : <span style={{ width: cur ? 6 : 5, height: cur ? 6 : 5, borderRadius: '50%', background: cur ? 'currentColor' : 'transparent', border: '1.5px solid currentColor' }} />}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: cur ? 600 : 400, color: cur ? 'var(--rail-active-fg)' : 'var(--rail-fg-dim)' }}>{sub.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}

        {/* collaboration nav (deferred backend pass) — additive, below the
            phase pipeline so the build flow stays primary */}
        <div style={{ ...mono, fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--rail-fg-dim)', padding: '12px 14px 4px' }}>Colaboração</div>
        <button onClick={() => { track('nav_click', { target: 'team' }); setSection('team') }} style={phaseRow({ current: activeSection === 'team' })}>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22 }}><span style={{ display: 'block', width: 14, height: 14, color: 'var(--rail-fg-dim)' }}>{ICONS.team}</span></span>
          <span style={{ flex: 1, textAlign: 'left', fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, color: 'var(--rail-fg)' }}>Equipe & tarefas</span>
        </button>
        <button onClick={() => { track('nav_click', { target: 'reports' }); setSection('reports') }} style={phaseRow({ current: activeSection === 'reports' })}>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22 }}><span style={{ display: 'block', width: 14, height: 14, color: 'var(--rail-fg-dim)' }}>{ICONS.reports}</span></span>
          <span style={{ flex: 1, textAlign: 'left', fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, color: 'var(--rail-fg)' }}>Relatórios</span>
        </button>
        {isManager && (
          <button onClick={() => { track('nav_click', { target: 'metrics' }); setSection('metrics') }} style={phaseRow({ current: activeSection === 'metrics' })}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22 }}><span style={{ display: 'block', width: 14, height: 14, color: 'var(--rail-fg-dim)' }}>{ICONS.metrics}</span></span>
            <span style={{ flex: 1, textAlign: 'left', fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, color: 'var(--rail-fg)' }}>Métricas</span>
          </button>
        )}

        {/* platform admin (challenge moderation + market intelligence) */}
        {isAdmin && (
          <>
            <div style={{ ...mono, fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--rail-fg-dim)', padding: '12px 14px 4px' }}>Administração</div>
            <button onClick={() => { track('nav_click', { target: 'challenge-review' }); setSection('challenge-review') }} style={phaseRow({ current: activeSection === 'challenge-review' })}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22 }}><span style={{ display: 'block', width: 14, height: 14, color: 'var(--rail-fg-dim)' }}>{ICONS.review}</span></span>
              <span style={{ flex: 1, textAlign: 'left', fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, color: 'var(--rail-fg)' }}>Fila de revisão</span>
            </button>
            <button onClick={() => { track('nav_click', { target: 'market-intel' }); setSection('market-intel') }} style={phaseRow({ current: activeSection === 'market-intel' })}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22 }}><span style={{ display: 'block', width: 14, height: 14, color: 'var(--rail-fg-dim)' }}>{ICONS.intel}</span></span>
              <span style={{ flex: 1, textAlign: 'left', fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, color: 'var(--rail-fg)' }}>Inteligência de mercado</span>
            </button>
          </>
        )}
      </div>

      {/* OBSat status widget */}
      <div style={{ borderTop: '1px solid var(--rail-line)' }}>
        <ObsatCompact />
      </div>

      {/* docked live budget meters */}
      <div style={{ borderTop: '1px solid var(--rail-line)', padding: '11px 14px 8px' }}>
        <div style={{ ...mono, fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--rail-fg-dim)', marginBottom: 8 }}>orçamentos</div>
        <BudgetMeters showFormat={false} compact />
        {!hwReady && <div style={{ ...mono, fontSize: 10, color: 'var(--rail-fg-dim)', marginTop: 4 }}>defina a missão para começar</div>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 10px', borderTop: '1px solid var(--rail-line)' }}>
        <button onClick={toggleTheme} title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'} style={iconBtn()}><span style={{ display: 'block', width: 18, height: 18 }}>{theme === 'dark' ? ICONS.sun : ICONS.moon}</span></button>
        <button onClick={() => { track('analytics_open'); setSection('analytics') }} title="Analytics (dev)" style={iconBtn(activeSection === 'analytics')}><span style={{ display: 'block', width: 18, height: 18 }}>{ICONS.settings}</span></button>
      </div>
    </aside>
  )
}

// shared footer for the collapsed rail
function RailFooterButtons({ toggleSidebar, theme, toggleTheme, activeSection, setSection }) {
  return (
    <>
      <button onClick={toggleSidebar} title="Expandir" style={{ ...railBtn({}), marginBottom: 4 }}><span style={{ display: 'block', width: 18, height: 18 }}>{ICONS.expand}</span></button>
      <button onClick={toggleTheme} title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'} style={railBtn({})}><span style={{ display: 'block', width: 18, height: 18 }}>{theme === 'dark' ? ICONS.sun : ICONS.moon}</span></button>
      <button onClick={() => { track('analytics_open'); setSection('analytics') }} title="Analytics (dev)" style={railBtn({ current: activeSection === 'analytics' })}><span style={{ display: 'block', width: 18, height: 18 }}>{ICONS.settings}</span></button>
    </>
  )
}

// ── style helpers ──────────────────────────────────────────────────
const PHASE_BY_ACTIVE = (section) => (PHASES.find(p => p.section === section)?.id || 'mission')

const railStyle = () => ({ width: 48, flexShrink: 0, background: 'var(--rail-bg)', borderRight: '1px solid var(--rule2)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 0', zIndex: 20 })
const railBtn = (st) => ({ position: 'relative', width: 34, height: 34, borderRadius: 7, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: st.current ? 'var(--rail-active-bg)' : 'transparent', color: st.current ? 'var(--rail-active-fg)' : st.locked ? 'var(--ink4)' : 'var(--rail-fg)' })
const dotBadge = (bg) => ({ position: 'absolute', top: -2, right: -2, width: 13, height: 13, borderRadius: '50%', background: bg, color: 'var(--rail-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid var(--rail-bg)' })
const phaseRow = (st) => ({ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 12px 8px 9px', border: 'none',
  borderLeft: st.current ? '3px solid var(--rail-active-fg)' : '3px solid transparent', cursor: 'pointer',
  background: st.current ? 'var(--rail-active-bg)' : 'transparent' })
const subRow = (cur) => ({ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '5px 12px 5px 31px', border: 'none',
  borderLeft: cur ? '3px solid var(--rail-active-fg)' : '3px solid transparent', background: cur ? 'var(--rail-active-bg)' : 'none', cursor: 'pointer', textAlign: 'left' })
const iconBtn = (active) => ({ width: 32, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: active ? 'var(--rail-active-bg)' : 'transparent', color: active ? 'var(--rail-active-fg)' : 'var(--rail-fg)' })
