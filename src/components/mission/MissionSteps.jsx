import { useState } from 'react'
import useForge, { COMPONENT_DEFS, STATUS } from '../../store/useForge'
import {
  getFramework, WORKFLOW_STEPS, nextStepId, prevStepId,
  SOFTWARE_MODULES, capsOf, capLabel, hasCapability, defsForIds,
} from '../../mission/index.js'

// ── shared primitives ─────────────────────────────────────────────
const mono = { fontFamily: "'Space Mono', monospace" }
const SEV = { error: 'var(--err2)', warn: 'var(--warn2)', info: 'var(--ink3)' }

function Panel({ title, sub, children }) {
  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '18px 24px 28px' }}>
      <div style={{ maxWidth: 720 }}>
        <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--ink)', marginBottom: sub ? 3 : 14 }}>{title}</h2>
        {sub && <p style={{ fontSize: 12, color: 'var(--ink3)', lineHeight: 1.6, marginBottom: 16 }}>{sub}</p>}
        {children}
      </div>
    </div>
  )
}

function SubLabel({ children }) {
  return <div style={{ ...mono, fontSize: 8, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink4)', margin: '18px 0 8px' }}>{children}</div>
}

function CapTag({ cap, hot }) {
  return (
    <span style={{
      ...mono, fontSize: 8, letterSpacing: '.04em', padding: '1px 6px', borderRadius: 3,
      border: '1px solid var(--rule)', color: hot ? 'var(--acc)' : 'var(--ink4)',
      background: hot ? 'rgba(43,94,167,.08)' : 'transparent',
    }}>{capLabel(cap)}</span>
  )
}

function PartCard({ def, selected, onToggle, highlightCap }) {
  return (
    <button onClick={() => onToggle(def.id)} style={{
      display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
      border: `1px solid ${selected ? 'var(--acc)' : 'var(--rule)'}`,
      background: selected ? 'rgba(43,94,167,.05)' : 'var(--paper2)',
      borderRadius: 6, padding: '10px 12px', marginBottom: 8, transition: 'all .12s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
        <span style={{ width: 12, height: 12, borderRadius: 3, border: `1px solid ${selected ? 'var(--acc)' : 'var(--ink4)'}`, background: selected ? 'var(--acc)' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 9 }}>{selected ? '✓' : ''}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{def.label}</span>
        <span style={{ ...mono, fontSize: 8, color: 'var(--ink4)', marginLeft: 'auto' }}>{def.protocol} · {def.mass}g · {def.current ?? '—'}mA</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {capsOf(def).map(c => <CapTag key={c} cap={c} hot={c === highlightCap} />)}
      </div>
    </button>
  )
}

function StepFooter({ step }) {
  const setWorkflowStep = useForge(s => s.setWorkflowStep)
  const prev = prevStepId(step), next = nextStepId(step)
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--rule)' }}>
      {prev !== step && (
        <button onClick={() => setWorkflowStep(prev)} style={btn('ghost')}>← Voltar</button>
      )}
      <div style={{ flex: 1 }} />
      {next !== step && (
        <button onClick={() => setWorkflowStep(next)} style={btn('primary')}>Próximo →</button>
      )}
    </div>
  )
}

function btn(kind) {
  const base = { fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, padding: '7px 16px', borderRadius: 5, cursor: 'pointer', transition: 'all .12s' }
  if (kind === 'primary') return { ...base, border: 'none', background: 'var(--navy)', color: 'rgba(255,255,255,.85)' }
  if (kind === 'ghost') return { ...base, border: '1px solid var(--rule)', background: 'var(--paper2)', color: 'var(--ink3)' }
  return base
}

// ── steps ──────────────────────────────────────────────────────────
function FrameworkStep() {
  const { missionPlan, setCustomDescription, runCopilot, setWorkflowStep } = useForge()
  const fw = getFramework(missionPlan.frameworkId)
  if (!fw) return null

  if (fw.kind === 'custom') {
    return (
      <Panel title="Missão personalizada" sub={fw.tagline}>
        <SubLabel>Descrição em linguagem natural</SubLabel>
        <textarea
          value={missionPlan.custom.description}
          onChange={e => setCustomDescription(e.target.value)}
          placeholder="Ex.: Sonda de qualidade do ar medindo CO₂, temperatura e pressão até 30 km, com telemetria por LoRa e gravação em cartão SD…"
          style={{
            width: '100%', minHeight: 130, resize: 'vertical', padding: '12px 14px',
            border: '1px solid var(--rule)', borderRadius: 6, background: 'var(--paper2)',
            fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, color: 'var(--ink)', lineHeight: 1.6, outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={() => runCopilot('custom')} style={btn('primary')}>Analisar com o copiloto →</button>
          <button onClick={() => setWorkflowStep('environment')} style={btn('ghost')}>Definir ambiente</button>
        </div>
        <p style={{ ...mono, fontSize: 9, color: 'var(--ink4)', marginTop: 12, lineHeight: 1.6 }}>
          O copiloto identifica sensores, comunicação, energia e riscos a partir da descrição.
        </p>
        <StepFooter step="framework" />
      </Panel>
    )
  }

  return (
    <Panel title={`${fw.name} · ${fw.full}`} sub={fw.description}>
      <SubLabel>Requisitos</SubLabel>
      {fw.requirements.map(r => (
        <div key={r.id} style={{ display: 'flex', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--rule2)' }}>
          <span style={{ ...mono, fontSize: 7, letterSpacing: '.08em', textTransform: 'uppercase', color: SEV[r.severity], width: 54, flexShrink: 0, paddingTop: 2 }}>{r.severity === 'error' ? 'obrig.' : r.severity === 'warn' ? 'forte' : 'sugerido'}</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{r.title}</div>
            <div style={{ fontSize: 11, color: 'var(--ink3)', lineHeight: 1.5 }}>{r.detail}</div>
          </div>
        </div>
      ))}

      <SubLabel>Linha do tempo</SubLabel>
      {fw.timeline.map((t, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: SEV[t.cls] || 'var(--ink4)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--ink2)', flex: 1 }}>{t.phase}</span>
          <span style={{ ...mono, fontSize: 9, color: 'var(--ink4)' }}>{t.when}</span>
        </div>
      ))}

      <SubLabel>Critérios de pontuação</SubLabel>
      {fw.scoring.map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '3px 0' }}>
          <span style={{ fontSize: 11, color: 'var(--ink2)', width: 220, flexShrink: 0 }}>{s.criterion}</span>
          <div style={{ flex: 1, height: 5, background: 'var(--paper3)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${s.weight}%`, height: '100%', background: 'var(--acc2)' }} />
          </div>
          <span style={{ ...mono, fontSize: 9, color: 'var(--ink4)', width: 28, textAlign: 'right' }}>{s.weight}%</span>
        </div>
      ))}

      <SubLabel>Ambiente & payload</SubLabel>
      <div style={{ ...mono, fontSize: 10, color: 'var(--ink3)', lineHeight: 1.9 }}>
        <div>plataforma · {fw.environment.platform}</div>
        <div>altitude · {fw.environment.altitude} · temp {fw.environment.tempRange}</div>
        <div>massa máx · {fw.payload.massMaxG} g</div>
      </div>

      <div style={{ marginTop: 18 }}>
        <button onClick={() => setWorkflowStep('objectives')} style={btn('primary')}>Começar planejamento →</button>
      </div>
      <StepFooter step="framework" />
    </Panel>
  )
}

function ObjectivesStep() {
  const { missionPlan, addObjective, removeObjective } = useForge()
  const fw = getFramework(missionPlan.frameworkId)
  const [text, setText] = useState('')
  const suggestions = (fw?.suggestedObjectives || []).filter(o => !missionPlan.objectives.includes(o))

  return (
    <Panel title="Objetivos da missão" sub="O que a missão precisa alcançar. Os objetivos guiam as recomendações do copiloto.">
      {missionPlan.objectives.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--ink4)', marginBottom: 8 }}>Nenhum objetivo definido ainda.</div>
      )}
      {missionPlan.objectives.map((o, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--paper2)', border: '1px solid var(--rule)', borderRadius: 5, marginBottom: 6 }}>
          <span style={{ color: 'var(--ok2)' }}>›</span>
          <span style={{ flex: 1, fontSize: 12, color: 'var(--ink)' }}>{o}</span>
          <button onClick={() => removeObjective(i)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ink4)', fontSize: 15 }}>×</button>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <input value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { addObjective(text); setText('') } }}
          placeholder="Adicionar objetivo…"
          style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--rule)', borderRadius: 5, background: 'var(--paper2)', fontSize: 12, color: 'var(--ink)', outline: 'none', fontFamily: "'Space Grotesk', sans-serif" }} />
        <button onClick={() => { addObjective(text); setText('') }} style={btn('primary')}>Adicionar</button>
      </div>

      {suggestions.length > 0 && (
        <>
          <SubLabel>Sugestões do framework</SubLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {suggestions.map(o => (
              <button key={o} onClick={() => addObjective(o)} style={{ ...btn('ghost'), fontSize: 11, padding: '5px 10px' }}>+ {o}</button>
            ))}
          </div>
        </>
      )}
      <StepFooter step="objectives" />
    </Panel>
  )
}

function EnvironmentStep() {
  const { missionPlan, setEnvField } = useForge()
  const env = missionPlan.environment
  const field = (k, label, ph) => (
    <div style={{ marginBottom: 12 }}>
      <SubLabel>{label}</SubLabel>
      <input value={env[k] || ''} onChange={e => setEnvField(k, e.target.value)} placeholder={ph}
        style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--rule)', borderRadius: 5, background: 'var(--paper2)', fontSize: 12, color: 'var(--ink)', outline: 'none', fontFamily: "'Space Grotesk', sans-serif" }} />
    </div>
  )
  return (
    <Panel title="Ambiente & restrições" sub="Onde a missão opera. Define os riscos ambientais que o copiloto considera.">
      {field('platform', 'Plataforma de lançamento', 'Balão / suborbital / drone…')}
      {field('altitude', 'Altitude / ambiente', 'Ex.: ~30 km')}
      {field('tempRange', 'Faixa de temperatura', 'Ex.: -60 °C … +30 °C')}
      <SubLabel>Notas</SubLabel>
      <textarea value={env.notes || ''} onChange={e => setEnvField('notes', e.target.value)}
        placeholder="Vibração no lançamento, vácuo parcial, exposição solar…"
        style={{ width: '100%', minHeight: 80, resize: 'vertical', padding: '10px 12px', border: '1px solid var(--rule)', borderRadius: 5, background: 'var(--paper2)', fontSize: 12, color: 'var(--ink)', lineHeight: 1.6, outline: 'none', fontFamily: "'Space Grotesk', sans-serif" }} />
      <StepFooter step="environment" />
    </Panel>
  )
}

function PartStep({ step, title, sub, filter, highlightCap }) {
  const { missionPlan, togglePlanComponent } = useForge()
  const parts = Object.values(COMPONENT_DEFS).filter(filter)
  return (
    <Panel title={title} sub={sub}>
      {parts.map(def => (
        <PartCard key={def.id} def={def} selected={missionPlan.components.includes(def.id)}
          onToggle={togglePlanComponent} highlightCap={highlightCap} />
      ))}
      <StepFooter step={step} />
    </Panel>
  )
}

function SoftwareStep() {
  const { missionPlan, togglePlanSoftware } = useForge()
  const design = defsForIds(COMPONENT_DEFS, missionPlan.components)
  return (
    <Panel title="Módulos de software" sub="Componha o firmware. O copiloto avisa se um módulo exige hardware que ainda não está no projeto.">
      {SOFTWARE_MODULES.map(m => {
        const selected = missionPlan.software.includes(m.id)
        const unmet = (m.requires || []).filter(c => !hasCapability(design, c))
        return (
          <button key={m.id} onClick={() => togglePlanSoftware(m.id)} style={{
            display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
            border: `1px solid ${selected ? 'var(--acc)' : 'var(--rule)'}`,
            background: selected ? 'rgba(43,94,167,.05)' : 'var(--paper2)',
            borderRadius: 6, padding: '10px 12px', marginBottom: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, border: `1px solid ${selected ? 'var(--acc)' : 'var(--ink4)'}`, background: selected ? 'var(--acc)' : 'transparent', color: '#fff', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{selected ? '✓' : ''}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{m.label}</span>
              {selected && unmet.length > 0 && (
                <span style={{ ...mono, fontSize: 8, color: 'var(--warn2)', marginLeft: 'auto' }}>requer {unmet.map(capLabel).join(', ')}</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4, paddingLeft: 20 }}>{m.desc}</div>
          </button>
        )
      })}
      <StepFooter step="software" />
    </Panel>
  )
}

function ValidateStep() {
  const { validation, runValidation, togglePlanComponent, runCopilot } = useForge()
  return (
    <Panel title="Validação de requisitos" sub="Avalia o projeto contra as regras estruturadas do framework.">
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={runValidation} style={btn('primary')}>Validar requisitos</button>
        <button onClick={() => runCopilot('analysis')} style={btn('ghost')}>Abrir copiloto</button>
      </div>

      {!validation && <div style={{ fontSize: 12, color: 'var(--ink4)' }}>Rode a validação para ver o resultado.</div>}

      {validation && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <Stat n={validation.summary.passed} label="ok" color="var(--ok2)" />
            <Stat n={validation.summary.errors} label="erros" color="var(--err2)" />
            <Stat n={validation.summary.warnings} label="avisos" color="var(--warn2)" />
            <Stat n={`${validation.summary.massG}g`} label="massa" color="var(--ink3)" />
          </div>
          {validation.issues.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--ok)', padding: '10px 12px', background: 'rgba(42,107,74,.07)', borderRadius: 5, borderLeft: '2px solid var(--ok2)' }}>
              Todos os requisitos atendidos. Pronto para gerar a arquitetura.
            </div>
          )}
          {validation.issues.map((iss, i) => (
            <div key={i} style={{ borderLeft: `2px solid ${SEV[iss.severity]}`, background: 'var(--paper2)', borderRadius: 3, padding: '9px 11px', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <span style={{ ...mono, fontSize: 7, letterSpacing: '.1em', textTransform: 'uppercase', color: SEV[iss.severity] }}>{iss.severity === 'error' ? 'incompatível' : iss.severity}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{iss.title}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink3)', lineHeight: 1.55 }}>{iss.detail}</div>
              {iss.suggestions?.length > 0 && (
                <div style={{ marginTop: 7, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {iss.suggestions.map(s => (
                    <button key={s.id} onClick={() => togglePlanComponent(s.id)} style={{ ...btn('ghost'), fontSize: 11, padding: '4px 10px' }}>+ {s.label}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </>
      )}
      <StepFooter step="validate" />
    </Panel>
  )
}

function Stat({ n, label, color }) {
  return (
    <div style={{ flex: 1, border: '1px solid var(--rule)', borderRadius: 6, padding: '8px 10px', background: 'var(--paper2)' }}>
      <div style={{ ...mono, fontSize: 18, fontWeight: 700, color }}>{n}</div>
      <div style={{ ...mono, fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink4)' }}>{label}</div>
    </div>
  )
}

function ArchitectureStep() {
  const { missionPlan, generateArchitectureFromPlan, entities, setSection } = useForge()
  const has = Object.keys(entities).length > 0
  const parts = defsForIds(COMPONENT_DEFS, missionPlan.components)
  return (
    <Panel title="Gerar arquitetura" sub="Transforma o plano em um gêmeo digital: instancia os módulos no PCB com conexões e telemetria.">
      <SubLabel>Componentes planejados ({parts.length})</SubLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {parts.map(d => (
          <span key={d.id} style={{ ...mono, fontSize: 10, padding: '4px 9px', borderRadius: 4, border: '1px solid var(--rule)', background: 'var(--paper2)', color: 'var(--ink2)' }}>{d.label}</span>
        ))}
        {parts.length === 0 && <span style={{ fontSize: 12, color: 'var(--ink4)' }}>Nada selecionado — a geração adiciona MCU + energia automaticamente.</span>}
      </div>

      <button onClick={generateArchitectureFromPlan} style={btn('primary')}>⚙ Gerar hardware/software</button>

      {has && (
        <div style={{ marginTop: 16, padding: '12px 14px', background: 'rgba(42,107,74,.06)', border: '1px solid var(--rule)', borderLeft: '2px solid var(--ok2)', borderRadius: 5 }}>
          <div style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 600, marginBottom: 6 }}>
            Arquitetura gerada — {Object.keys(entities).length} módulos no gêmeo digital.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setSection('hardware')} style={{ ...btn('ghost'), fontSize: 11 }}>Ver PCB 3D →</button>
            <button onClick={() => setSection('architecture')} style={{ ...btn('ghost'), fontSize: 11 }}>Ver diagrama →</button>
          </div>
        </div>
      )}
      <StepFooter step="architecture" />
    </Panel>
  )
}

function TestStep() {
  const { entities, runScan, isScanning, selectEntity, setSection } = useForge()
  const list = Object.values(entities)
  if (!list.length) return <Panel title="Testes de módulos" sub="Gere a arquitetura primeiro para testar os módulos."><GenHint /><StepFooter step="test" /></Panel>
  return (
    <Panel title="Testes de módulos" sub="Verifique a resposta de cada módulo no barramento.">
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button onClick={runScan} disabled={isScanning} style={btn('primary')}>{isScanning ? 'Verificando…' : 'Rodar I2C/SPI scan'}</button>
        <button onClick={() => setSection('hardware')} style={btn('ghost')}>Abrir Hardware 3D</button>
      </div>
      {list.map(e => (
        <button key={e.id} onClick={() => { selectEntity(e.id); setSection('hardware') }} style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', cursor: 'pointer',
          border: '1px solid var(--rule)', background: 'var(--paper2)', borderRadius: 5, padding: '8px 12px', marginBottom: 6,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: e.status === STATUS.OK ? 'var(--ok2)' : e.status === STATUS.ERR ? 'var(--err2)' : e.status === STATUS.WARN ? 'var(--warn2)' : 'var(--ink4)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--ink)', flex: 1 }}>{e.def.label}</span>
          <span style={{ ...mono, fontSize: 9, color: 'var(--ink4)' }}>{e.def.protocol}</span>
        </button>
      ))}
      <StepFooter step="test" />
    </Panel>
  )
}

function OperateStep() {
  const { entities, telemetry, setSection } = useForge()
  if (!Object.keys(entities).length) return <Panel title="Operação da missão" sub="Gere a arquitetura para simular a operação."><GenHint /><StepFooter step="operate" /></Panel>
  return (
    <Panel title="Operação da missão" sub="A simulação roda continuamente: sensores, telemetria e enlace.">
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <Stat n={Object.keys(entities).length} label="módulos" color="var(--ink2)" />
        <Stat n={telemetry.length} label="amostras" color="var(--acc)" />
        <Stat n="0.33 Hz" label="taxa" color="var(--ink3)" />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setSection('telemetry')} style={btn('primary')}>Abrir Telemetria →</button>
        <button onClick={() => setSection('serial')} style={btn('ghost')}>Monitor serial</button>
      </div>
      <StepFooter step="operate" />
    </Panel>
  )
}

function GenHint() {
  const setWorkflowStep = useForge(s => s.setWorkflowStep)
  return (
    <button onClick={() => setWorkflowStep('architecture')} style={btn('primary')}>Ir para geração de arquitetura →</button>
  )
}

const STEP_PANELS = {
  framework: FrameworkStep,
  objectives: ObjectivesStep,
  environment: EnvironmentStep,
  payload: () => <PartStep step="payload" title="Payload & sensores" sub="Escolha os sensores científicos da missão." filter={d => d.category === 'sensor'} />,
  comms: () => <PartStep step="comms" title="Arquitetura de comunicação" sub="Computador de bordo e rádios. Para o OBSAT, o MCU precisa ter WiFi." filter={d => d.category === 'mcu' || d.category === 'comm'} highlightCap="wifi" />,
  software: SoftwareStep,
  validate: ValidateStep,
  architecture: ArchitectureStep,
  test: TestStep,
  operate: OperateStep,
}

export default function MissionWorkflow() {
  const { missionPlan, workflowStep, exitFramework, runCopilot } = useForge()
  const fw = getFramework(missionPlan.frameworkId)
  const stepDef = WORKFLOW_STEPS.find(s => s.id === workflowStep) || WORKFLOW_STEPS[0]
  const Step = STEP_PANELS[workflowStep] || FrameworkStep

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* workflow header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 24px', borderBottom: '1px solid var(--rule)', flexShrink: 0, background: 'var(--paper2)' }}>
        <span style={{ ...mono, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink3)' }}>{fw?.name}</span>
        <span style={{ color: 'var(--ink4)' }}>›</span>
        <span style={{ ...mono, fontSize: 9, color: 'var(--ink4)' }}>etapa {stepDef.n}/10</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{stepDef.label}</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => runCopilot('analysis')} style={{ ...btn('ghost'), fontSize: 11, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ok2)' }} />Copiloto
        </button>
        <button onClick={exitFramework} style={{ ...btn('ghost'), fontSize: 11, padding: '5px 12px' }}>Trocar missão</button>
      </div>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Step />
      </div>
    </div>
  )
}
