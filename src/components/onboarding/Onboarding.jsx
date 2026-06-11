import useForge from '../../store/useForge'
import { mono, slab, CREAM, GOLD, PosterArt, primaryBtn, ghostBtn } from './posterKit.jsx'

// ──────────────────────────────────────────────────────────────────
// Onboarding — first-visit landing overlay.
//
// DESIGN RATIONALE (aesthetic research):
// · NASA JPL "Exoplanet Travel Bureau" posters → flat layered discs,
//   big celestial bodies, cream-on-deep-navy, confident display type.
// · CNES 70s/Soviet space poster graphics → diagonal dynamism, high
//   contrast, technical annotations as graphic texture.
// · Teenage Engineering / Playdate → dense mono microcopy, honest
//   controls; Linear → restraint, type-led hierarchy.
// Synthesis: deep navy field, cream + mission-patch gold/burnt-orange
// accents, Zilla Slab display over Space Mono annotations, one big
// poster graphic (planet + orbit + satellite) and generous negative
// space. The user must know what FORGE is within five seconds.
//
// The landing offers two genuine paths: the guided route opens the
// Mission window (where the mission is DEFINED — the same window the
// home icon opens, so nothing is ever asked twice), and the skip route
// drops straight into the Hardware window for free exploration.
// ──────────────────────────────────────────────────────────────────

export default function Onboarding() {
  const onboarding = useForge(s => s.onboarding)
  const startGuided = useForge(s => s.startGuided)
  const skipOnboarding = useForge(s => s.skipOnboarding)
  if (!onboarding) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 150, overflow: 'hidden',
      background: 'radial-gradient(120% 120% at 75% 20%, #223255 0%, #18243A 55%, #101A2C 100%)',
    }}>
      {/* worn-poster frame, in the spirit of printed mission art */}
      <div style={{
        position: 'absolute', inset: 14, border: '1.5px solid rgba(244,239,230,.22)',
        borderRadius: 4, pointerEvents: 'none',
      }} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 40, padding: '0 48px' }}>
        <div style={{ maxWidth: 560 }}>
          <div style={{ ...mono, fontSize: 12, letterSpacing: '.3em', textTransform: 'uppercase', color: GOLD, marginBottom: 18 }}>
            plataforma de desenvolvimento de missões
          </div>
          <h1 style={{ ...slab, fontSize: 96, fontWeight: 700, lineHeight: .95, color: CREAM, margin: '0 0 22px', letterSpacing: '-0.01em' }}>
            FORGE
          </h1>
          <p style={{ fontSize: 21, lineHeight: 1.5, color: 'rgba(244,239,230,.92)', margin: '0 0 10px', maxWidth: 520 }}>
            Monte, valide, programe e opere o satélite da sua equipe — da escolha
            dos sensores à estação terrestre, em um só lugar.
          </p>
          <p style={{ ...mono, fontSize: 13.5, lineHeight: 1.6, color: 'rgba(244,239,230,.7)', margin: '0 0 34px' }}>
            feito para equipes universitárias de CubeSat e balão estratosférico ·
            OBSAT e além · simulação honesta de hardware
          </p>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={startGuided} style={primaryBtn}>Começar com configuração guiada</button>
            <button onClick={skipOnboarding} style={ghostBtn}>Pular para o workspace</button>
          </div>
          <div style={{ ...mono, fontSize: 11.5, color: 'rgba(244,239,230,.55)', marginTop: 14 }}>
            a configuração guiada define a missão em ~2 minutos · dá para sair a qualquer momento
          </div>
        </div>
        <div style={{ flexShrink: 1, minWidth: 0 }}><PosterArt /></div>
      </div>
      <div style={{
        position: 'absolute', bottom: 22, left: 0, right: 0, textAlign: 'center', pointerEvents: 'none',
        ...mono, fontSize: 10.5, letterSpacing: '.22em', textTransform: 'uppercase', color: 'rgba(244,239,230,.45)',
      }}>forge mission systems · est. 2025 · simulação honesta</div>
    </div>
  )
}
