import { mono } from './posterKit.jsx'

// ──────────────────────────────────────────────────────────────────
// SatelliteAssembly — progressive build visualization for the Mission
// window.
//
// DESIGN RATIONALE: games that nail the feeling of "building something"
// (Kerbal Space Program's VAB, idle/incremental games) share two
// devices: (1) each decision IMMEDIATELY adds a visible part to the
// craft, converting abstract choices into accumulated, owned progress;
// (2) the not-yet-built parts stay visible as ghosted silhouettes, so
// the player always sees what the next decision unlocks. This component
// applies both inside FORGE's vintage-technical-illustration language:
// cream linework on the navy poster field, dashed blueprint ghosts,
// leader-line part labels in mono, an engineering title block — never
// photoreal 3D, never a progress bar.
//
// Colours theme via currentColor (svg style.color = --poster-fg) so the
// drawing reads as ink-on-paper in light and cream-on-navy in dark; gold
// accents go through inline style.fill (var() in SVG presentation
// attributes is not supported in Chrome/Safari — see posterKit).
//
// Part mapping (one subsystem per mission decision):
//   tipo de missão   → barramento (bus frame appears)
//   competição       → painéis solares (wings deploy)
//   objetivo         → carga útil (payload instrument)
//   identidade       → antena + callsign stencil → mission-ready light
// ──────────────────────────────────────────────────────────────────

const gold = { fill: 'var(--poster-gold)' }
const okFill = { fill: 'var(--ok2)' }

// a part: ghost blueprint silhouette until `on`, then solid + label
function Part({ on, ghost, children, label, labelAt, anchor }) {
  return (
    <>
      {/* ghosted silhouette of the future part — the "next unlock" cue */}
      <g style={{ opacity: on ? 0 : 0.16, transition: 'opacity .5s' }}>{ghost}</g>
      <g style={{
        opacity: on ? 1 : 0,
        transform: on ? 'none' : 'translateY(7px)',
        transition: 'opacity .55s ease, transform .55s ease',
      }}>
        {children}
        {label && (
          <g style={{ opacity: on ? 1 : 0, transition: 'opacity .6s .25s' }}>
            <line x1={anchor[0]} y1={anchor[1]} x2={labelAt[0]} y2={labelAt[1]}
              stroke="currentColor" strokeOpacity=".45" strokeWidth="0.8" strokeDasharray="2 3" />
            <circle cx={anchor[0]} cy={anchor[1]} r="1.6" style={gold} />
            <text x={labelAt[0]} y={labelAt[1] - 3} fontFamily="'Space Mono', monospace" fontSize="9"
              fill="currentColor" fillOpacity=".75" textAnchor={labelAt[0] > 150 ? 'start' : 'end'}
              style={{ textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</text>
          </g>
        )}
      </g>
    </>
  )
}

const BUS = (solid) => (
  <g stroke="currentColor" strokeWidth={solid ? 1.6 : 1.2} fill="currentColor"
    fillOpacity={solid ? 0.06 : 0} strokeDasharray={solid ? 'none' : '4 4'}>
    <rect x="105" y="150" width="90" height="90" />
    {solid && <>
      <line x1="105" y1="180" x2="195" y2="180" strokeOpacity=".5" />
      <line x1="105" y1="212" x2="195" y2="212" strokeOpacity=".5" />
      <line x1="135" y1="150" x2="135" y2="240" strokeOpacity=".3" />
      <rect x="113" y="157" width="14" height="14" fillOpacity="0" strokeOpacity=".7" />
      <circle cx="178" cy="226" r="6" fillOpacity="0" strokeOpacity=".7" />
    </>}
  </g>
)

const WING = (x, solid) => (
  <g stroke="currentColor" strokeWidth={solid ? 1.4 : 1} fill="currentColor"
    fillOpacity={solid ? 0.08 : 0} strokeDasharray={solid ? 'none' : '4 4'}>
    <rect x={x} y="158" width="62" height="74" />
    {solid && <>
      {[1, 2].map(i => <line key={i} x1={x + (62 / 3) * i} y1="158" x2={x + (62 / 3) * i} y2="232" strokeOpacity=".55" />)}
      {[1, 2].map(i => <line key={`h${i}`} x1={x} y1={158 + (74 / 3) * i} x2={x + 62} y2={158 + (74 / 3) * i} strokeOpacity=".55" />)}
    </>}
  </g>
)

export default function SatelliteAssembly({ plan }) {
  const kind = plan.kind || null
  const hasBus = !!kind
  const hasPanels = !!plan.frameworkId
  const hasPayload = !!plan.objectiveId
  const hasAntenna = plan.name.trim().length >= 2
  const ready = hasBus && hasPanels && hasPayload && hasAntenna
  const parts = [hasBus, hasPanels, hasPayload, hasAntenna].filter(Boolean).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
      <svg viewBox="0 0 300 400" style={{ width: '100%', maxWidth: 320, flex: 1, minHeight: 0, color: 'var(--poster-fg)' }} aria-hidden="true">
        {/* faint star backdrop */}
        {Array.from({ length: 18 }, (_, i) => (
          <circle key={i} cx={(i * 89 + 31) % 300} cy={(i * 47 + 19) % 380} r="0.9" fill="currentColor" opacity=".3" />
        ))}

        {/* antenna — identity (name gives the satellite its callsign) */}
        <Part on={hasAntenna} label="antena uhf" anchor={[150, 108]} labelAt={[226, 96]}
          ghost={<g stroke="currentColor" strokeDasharray="4 4"><line x1="150" y1="150" x2="150" y2="118" /><path d="M132 118 A 24 24 0 0 1 168 118" fill="none" /></g>}>
          <g stroke="currentColor" strokeWidth="1.4" fill="none">
            <line x1="150" y1="150" x2="150" y2="118" />
            <path d="M132 118 A 24 24 0 0 1 168 118" />
            <line x1="150" y1="118" x2="150" y2="106" />
            <circle cx="150" cy="104" r="2.4" style={gold} stroke="none" />
          </g>
        </Part>

        {/* solar wings — framework/competition (power for the rules you fly) */}
        <Part on={hasPanels} label="painéis solares" anchor={[40, 195]} labelAt={[34, 130]}
          ghost={<>{WING(36, false)}{WING(202, false)}</>}>
          {WING(36, true)}{WING(202, true)}
          <line x1="98" y1="195" x2="105" y2="195" stroke="currentColor" strokeWidth="1.4" />
          <line x1="195" y1="195" x2="202" y2="195" stroke="currentColor" strokeWidth="1.4" />
        </Part>

        {/* bus — mission kind (the structure everything mounts on) */}
        <Part on={hasBus} label="barramento" anchor={[195, 165]} labelAt={[252, 152]} ghost={BUS(false)}>
          {BUS(true)}
        </Part>

        {/* payload — scientific objective (what the mission measures) */}
        <Part on={hasPayload} label="carga útil" anchor={[150, 262]} labelAt={[230, 286]}
          ghost={<g stroke="currentColor" strokeDasharray="4 4" fill="none"><rect x="128" y="240" width="44" height="22" /><circle cx="150" cy="270" r="8" /></g>}>
          <g stroke="currentColor" strokeWidth="1.4" fill="currentColor" fillOpacity="0.05">
            <rect x="128" y="240" width="44" height="22" />
            <circle cx="150" cy="270" r="8" fillOpacity="0" />
            <circle cx="150" cy="270" r="3.4" style={gold} stroke="none" fillOpacity="1" />
          </g>
        </Part>

        {/* callsign stencil + mission-ready status light */}
        <g style={{ opacity: hasAntenna && plan.name.trim() ? 1 : 0, transition: 'opacity .5s' }}>
          <text x="150" y="200" textAnchor="middle" fontFamily="'Space Mono', monospace" fontSize="11"
            fontWeight="700" style={gold} stroke="none">
            {plan.name.trim().slice(0, 10).toUpperCase()}
          </text>
        </g>
        {ready && (
          <circle cx="186" cy="161" r="3" style={okFill}>
            <animate attributeName="opacity" values="1;.25;1" dur="1.6s" repeatCount="indefinite" />
          </circle>
        )}

        {/* engineering drawing title block */}
        <g fontFamily="'Space Mono', monospace" fill="currentColor">
          <rect x="22" y="346" width="256" height="34" fill="none" stroke="currentColor" strokeOpacity=".35" />
          <line x1="170" y1="346" x2="170" y2="380" stroke="currentColor" strokeOpacity=".35" />
          <text x="30" y="360" fontSize="8.5" fillOpacity=".6" style={{ letterSpacing: '.1em' }}>CONJUNTO · SATÉLITE</text>
          <text x="30" y="373" fontSize="9.5" fillOpacity=".9" fontWeight="700">
            {plan.name.trim() ? plan.name.trim().slice(0, 16).toUpperCase() : 'SEM DESIGNAÇÃO'}
          </text>
          <text x="178" y="360" fontSize="8.5" fillOpacity=".6" style={{ letterSpacing: '.1em' }}>SUBSISTEMAS</text>
          <text x="178" y="373" fontSize="9.5" fillOpacity=".9" fontWeight="700">{parts}/4 {ready ? '· PRONTO' : ''}</text>
        </g>
      </svg>
      <div style={{ ...mono, fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: ready ? 'var(--ok2)' : 'var(--poster-fg-dim)', paddingBottom: 4, textAlign: 'center' }}>
        {ready ? 'satélite montado · pronto para o hardware' : 'cada decisão monta uma parte do satélite'}
      </div>
    </div>
  )
}
