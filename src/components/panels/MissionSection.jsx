import useForge, { MISSION_TEMPLATES } from '../../store/useForge'
import { FRAMEWORK_LIST } from '../../mission/index.js'
import MissionWorkflow from '../mission/MissionSteps'
import CopilotPanel from '../mission/CopilotPanel'

const mono = { fontFamily: "'Space Mono', monospace" }

// Entry screen: pick a mission framework, a custom mission, or a quick profile.
function MissionHome() {
  const { selectFramework, loadTemplate } = useForge()

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '22px 26px 30px' }}>
      <div style={{ maxWidth: 640 }}>
        <div style={{ ...mono, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: 6 }}>
          Ambiente de engenharia de missão
        </div>
        <p style={{ fontSize: 12, color: 'var(--ink3)', lineHeight: 1.6, marginBottom: 20 }}>
          Escolha um framework de competição para planejar com requisitos validados, ou descreva uma
          missão personalizada e deixe o copiloto propor a arquitetura.
        </p>

        <div style={{ ...mono, fontSize: 8, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 10 }}>Frameworks de missão</div>
        <div style={{ display: 'grid', gap: 10, marginBottom: 24 }}>
          {FRAMEWORK_LIST.map(fw => (
            <button key={fw.id} onClick={() => selectFramework(fw.id)} style={{
              display: 'flex', alignItems: 'flex-start', gap: 14, padding: '15px 16px', borderRadius: 7,
              border: '1px solid var(--rule)', background: 'var(--paper2)', cursor: 'pointer', textAlign: 'left',
              transition: 'all .15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--paper4)'; e.currentTarget.style.background = 'var(--paper3)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--rule)'; e.currentTarget.style.background = 'var(--paper2)' }}>
              <span style={{
                width: 38, height: 38, borderRadius: 6, flexShrink: 0, background: 'var(--navy)',
                color: 'rgba(255,255,255,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                ...mono, fontSize: 11, fontWeight: 700, letterSpacing: '.04em',
              }}>{fw.kind === 'custom' ? '✎' : fw.name.slice(0, 4)}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{fw.full}</span>
                  <span style={{ ...mono, fontSize: 8, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink4)', border: '1px solid var(--rule)', borderRadius: 3, padding: '1px 5px' }}>{fw.kind === 'competition' ? 'competição' : 'personalizada'}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink3)', lineHeight: 1.55, marginTop: 4 }}>{fw.tagline}</div>
              </div>
              <span style={{ fontSize: 16, color: 'var(--ink4)', alignSelf: 'center' }}>→</span>
            </button>
          ))}
        </div>

        <div style={{ ...mono, fontSize: 8, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 10 }}>Perfis rápidos (gera hardware direto)</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {MISSION_TEMPLATES.map(t => (
            <button key={t.id} onClick={() => loadTemplate(t.id)} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 6,
              border: '1px solid var(--rule)', background: 'var(--paper2)', cursor: 'pointer', textAlign: 'left',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--paper3)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--paper2)'}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{t.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink)' }}>{t.label}</div>
                <div style={{ fontSize: 10, color: 'var(--ink3)', lineHeight: 1.5 }}>{t.description}</div>
              </div>
              <span style={{ ...mono, fontSize: 9, color: 'var(--ink4)' }}>{t.components.length} módulos</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function MissionSection() {
  const frameworkId = useForge(s => s.missionPlan.frameworkId)

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      {frameworkId ? <MissionWorkflow /> : <MissionHome />}
      <CopilotPanel />
    </div>
  )
}
