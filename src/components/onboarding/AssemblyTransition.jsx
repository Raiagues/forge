import { useEffect, useState } from 'react'
import useForge from '../../store/useForge'
import { mono, CREAM, GOLD } from './posterKit.jsx'

// ──────────────────────────────────────────────────────────────────
// AssemblyTransition — the connective tissue between Mission and
// Hardware (Part 4 of the redesign).
//
// When the user finishes defining the mission, the assembled satellite
// expands to fill the screen, then the camera zooms THROUGH the shell
// into the interior — where the board and components live. That interior
// reveal becomes the Hardware screen: the user is now working *inside*
// the satellite they just defined.
//
// Tonal reference: Kerbal Space Program's VAB→flight cuts and Monument
// Valley's calm scene transitions — unhurried, diegetic, never flashy.
// ~2.4s total. Not skippable on first view; a skip affordance appears on
// repeat visits (store.transition.skippable). Pure CSS transitions keyed
// off a phase state machine — no animation library.
// ──────────────────────────────────────────────────────────────────

const gold = { fill: 'var(--poster-gold)' }

// Assembled exterior (matches SatelliteAssembly's vintage line language).
function SatelliteExterior() {
  return (
    <g stroke="currentColor" fill="none">
      {/* solar wings */}
      <g strokeWidth="1.4" fill="currentColor" fillOpacity="0.08">
        <rect x="6" y="60" width="48" height="80" />
        <rect x="146" y="60" width="48" height="80" />
        {[1, 2].map(i => <line key={`l${i}`} x1={6 + 16 * i} y1="60" x2={6 + 16 * i} y2="140" strokeOpacity=".5" />)}
        {[1, 2].map(i => <line key={`r${i}`} x1={146 + 16 * i} y1="60" x2={146 + 16 * i} y2="140" strokeOpacity=".5" />)}
      </g>
      {/* bus */}
      <rect x="60" y="46" width="80" height="108" strokeWidth="1.8" fill="currentColor" fillOpacity="0.06" />
      <line x1="60" y1="100" x2="140" y2="100" strokeOpacity=".4" strokeWidth="1.2" />
      {/* antenna */}
      <line x1="100" y1="46" x2="100" y2="16" strokeWidth="1.4" />
      <path d="M84 16 A 24 24 0 0 1 116 16" strokeWidth="1.4" />
      <circle cx="100" cy="12" r="3" style={gold} stroke="none" />
      {/* payload window */}
      <circle cx="100" cy="118" r="12" strokeWidth="1.4" />
      <circle cx="100" cy="118" r="5" style={gold} stroke="none" />
    </g>
  )
}

// Interior: the PCB the camera lands on (becomes the Hardware view).
function SatelliteInterior() {
  return (
    <g>
      <rect x="20" y="30" width="160" height="140" rx="4" fill="#1E6B49" stroke="#0f3d2a" strokeWidth="2" />
      {/* silkscreen grid dots */}
      {Array.from({ length: 40 }, (_, i) => (
        <circle key={i} cx={30 + (i % 8) * 20} cy={42 + Math.floor(i / 8) * 26} r="1.1" fill="#3fae7d" opacity=".5" />
      ))}
      {/* MCU + two sensor chips */}
      <rect x="78" y="84" width="44" height="34" rx="2" fill="#2B3F7A" stroke="#16223f" strokeWidth="1.5" />
      <rect x="40" y="120" width="26" height="20" rx="2" fill="#1E3A28" stroke="#0f1d14" strokeWidth="1.2" />
      <rect x="134" y="120" width="26" height="20" rx="2" fill="#2A2014" stroke="#140f08" strokeWidth="1.2" />
      {/* copper traces */}
      <g stroke="#C98A3A" strokeWidth="1.6" fill="none" opacity=".85">
        <path d="M66 130 L78 110" />
        <path d="M134 130 L122 110" />
      </g>
    </g>
  )
}

export default function AssemblyTransition() {
  const transition = useForge(s => s.transition)
  const endTransition = useForge(s => s.endTransition)
  const [phase, setPhase] = useState('enter')   // enter → grow → zoom

  useEffect(() => {
    if (!transition?.playing) return
    setPhase('enter')
    const t0 = setTimeout(() => setPhase('grow'), 40)     // kick the grow transition
    const t1 = setTimeout(() => setPhase('zoom'), 1250)   // dive into the interior
    const t2 = setTimeout(() => endTransition(), 2450)    // land on Hardware
    return () => { clearTimeout(t0); clearTimeout(t1); clearTimeout(t2) }
  }, [transition, endTransition])

  if (!transition?.playing) return null

  // The satellite enters from the RIGHT — where the SatelliteAssembly panel
  // lived in the mission flow — then slides to centre, grows to fill the
  // viewport and the camera dives through the shell (Part 3).
  const exteriorStyle = {
    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'transform 1.2s cubic-bezier(.5,0,.2,1), opacity .8s ease',
    transform: phase === 'enter' ? 'translateX(32vw) scale(.3)'
      : phase === 'grow' ? 'translateX(0) scale(1)'
      : 'translateX(0) scale(6)',
    opacity: phase === 'zoom' ? 0 : 1,
    color: CREAM,
  }
  const interiorStyle = {
    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'transform 1.1s cubic-bezier(.5,0,.2,1), opacity .9s ease',
    transform: phase === 'zoom' ? 'scale(1)' : 'scale(.4)',
    opacity: phase === 'zoom' ? 1 : 0,
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'var(--poster-bg)', overflow: 'hidden' }}>
      {/* star field */}
      <svg style={{ position: 'absolute', inset: 0 }} width="100%" height="100%" aria-hidden="true">
        {Array.from({ length: 60 }, (_, i) => (
          <circle key={i} cx={`${(i * 97) % 100}%`} cy={`${(i * 53 + 17) % 100}%`} r={i % 7 === 0 ? 1.5 : 0.8} fill={CREAM} opacity=".3" />
        ))}
      </svg>

      <div style={exteriorStyle}>
        <svg viewBox="0 0 200 170" width="min(46vh, 460px)" height="min(46vh, 460px)" aria-hidden="true">
          <SatelliteExterior />
        </svg>
      </div>
      <div style={interiorStyle}>
        <svg viewBox="0 0 200 200" width="min(92vh, 920px)" height="min(92vh, 920px)" aria-hidden="true">
          <SatelliteInterior />
        </svg>
      </div>

      {/* caption + skip-on-repeat */}
      <div style={{ position: 'absolute', bottom: 40, left: 0, right: 0, textAlign: 'center' }}>
        <div style={{ ...mono, fontSize: 12, letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--poster-fg-dim)' }}>
          {phase === 'zoom' ? 'entrando no satélite · integração de hardware' : 'satélite montado · sistemas nominais'}
        </div>
        {transition.skippable && (
          <button onClick={endTransition} style={{ ...mono, fontSize: 11, letterSpacing: '.08em', color: GOLD, background: 'none', border: 'none', cursor: 'pointer', marginTop: 10 }}>
            pular →
          </button>
        )}
      </div>
    </div>
  )
}
