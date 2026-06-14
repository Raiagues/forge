import { useState } from 'react'
import useForge, { COMPONENT_DEFS } from '../../store/useForge'
import {
  FRAMEWORK_LIST, COMING_SOON_FRAMEWORKS, OBJECTIVES, getFramework, resolveObjective,
  FAB_RULES, getFabRule, OBSAT_FORMAT_LIST,
} from '../../mission/index.js'
import { track } from '../../lib/analytics.js'
import {
  mono, slab, CREAM, GOLD, NAVY_FIELD, primaryBtn, h2, sub, inputStyle,
  MISSION_KINDS, StepDots, Card,
} from '../onboarding/posterKit.jsx'
import SatelliteAssembly from '../onboarding/SatelliteAssembly.jsx'
import { usePanelWidth } from '../ui/usePanelWidth'
import { PanelDivider } from '../ui/Resizable'

// ──────────────────────────────────────────────────────────────────
// MissionWindow — the mission-definition CONSULTANT (Part 2).
//
// Not a chat box and not a form: a structured flow that asks targeted
// questions and, after each answer, thinks alongside the user — surfacing
// constraints, implications and an early DRAFT component list so they
// reach Hardware with a populated board, not a blank one. The mission is
// DEFINED here exactly once; Hardware (Part 8) only lays it out.
//
// Flow (competition path): contexto → competição → formato → objetivo
// (texto livre + sugestões do consultor) → equipe (+ situação em
// linguagem natural) → restrições (orçamento) → identidade. Non-
// competition kinds skip the competition step. Every field is live-bound
// to missionPlan; the SatelliteAssembly side panel grows per decision.
// ──────────────────────────────────────────────────────────────────

const label = { ...mono, fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--poster-fg-dim)' }

// fabrication target lives in advanced options (still real, functional)
function AdvancedOptions() {
  const [open, setOpen] = useState(false)
  const ruleId = useForge(s => s.board.ruleId)
  const setFabRule = useForge(s => s.setFabRule)
  const rule = getFabRule(ruleId)
  return (
    <div style={{ marginTop: 4 }}>
      <button onClick={() => { track('panel_toggle', { panel: 'advanced_options', action: open ? 'close' : 'open' }); setOpen(v => !v) }}
        style={{ ...mono, fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--poster-fg-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s', display: 'inline-block' }}>▸</span>
        opções avançadas
        <span style={{ fontSize: 10, color: 'var(--poster-fg-dim)', textTransform: 'none', letterSpacing: '.04em' }}>opcional</span>
      </button>
      {open && (
        <div style={{ marginTop: 9, padding: '12px 14px', borderRadius: 8, border: '1.5px dashed var(--poster-line)', background: 'var(--poster-card)' }}>
          <div style={{ ...mono, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: GOLD, marginBottom: 7 }}>alvo de fabricação</div>
          <select value={ruleId} onChange={(e) => setFabRule(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, ...mono, fontSize: 13, border: '1px solid var(--poster-line)', background: 'var(--poster-input)', color: 'var(--poster-fg)' }}>
            {FAB_RULES.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <div style={{ ...mono, fontSize: 10.5, color: 'var(--poster-fg-dim)', lineHeight: 1.5, marginTop: 6 }}>
            trilha mín {rule.minTraceMm} mm · isolamento {rule.minClearanceMm} mm · {rule.material}. {rule.note}
          </div>
        </div>
      )}
    </div>
  )
}

// The consultant's feedback panel — reply + warnings + draft (add to build).
function ConsultantPanel() {
  const { consult, askConsultant, applyConsultDraft, entities } = useForge()
  const r = consult.result
  return (
    <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 10, border: '1.5px solid var(--poster-line)', background: 'var(--poster-card)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ ...mono, fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: GOLD }}>Consultor de engenharia</span>
        {consult.provider === 'anthropic' && <span style={{ ...mono, fontSize: 9.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--poster-fg-dim)' }}>· ao vivo</span>}
        <span style={{ flex: 1 }} />
        <button onClick={() => askConsultant()} disabled={consult.running}
          style={{ ...mono, fontSize: 11, letterSpacing: '.04em', color: 'var(--poster-bg-solid)', background: GOLD, border: 'none', borderRadius: 5, padding: '5px 12px', cursor: consult.running ? 'wait' : 'pointer', opacity: consult.running ? .6 : 1 }}>
          {consult.running ? 'analisando…' : r ? 'analisar de novo' : 'pedir análise'}
        </button>
      </div>
      {!r && !consult.running && (
        <div style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--poster-fg-dim)' }}>
          Descreva o objetivo e a situação da equipe e o consultor sugere sensores e aponta os tradeoffs antes de você ir ao hardware.
        </div>
      )}
      {r && (
        <>
          <div style={{ fontSize: 14, lineHeight: 1.55, color: CREAM }}>{r.reply}</div>
          {r.warnings?.length > 0 && (
            <ul style={{ margin: '10px 0 0', paddingLeft: 18 }}>
              {r.warnings.map((w, i) => (
                <li key={i} style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--poster-fg-dim)', marginBottom: 4 }}>{w}</li>
              ))}
            </ul>
          )}
          {r.draft?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ ...mono, fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--poster-fg-dim)', marginBottom: 6 }}>componentes sugeridos</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {r.draft.map(id => {
                  const placed = !!entities[id]
                  return (
                    <button key={id} onClick={() => !placed && useForge.getState().toggleHardware(id)} disabled={placed}
                      style={{ ...mono, fontSize: 12, padding: '4px 10px', borderRadius: 5, cursor: placed ? 'default' : 'pointer',
                        border: `1px solid ${placed ? 'var(--ok2)' : 'var(--poster-line)'}`, background: placed ? 'rgba(58,144,96,.12)' : 'var(--poster-input)',
                        color: placed ? 'var(--ok2)' : CREAM }}>
                      {placed ? '✓ ' : '+ '}{COMPONENT_DEFS[id]?.friendly || id}
                    </button>
                  )
                })}
              </div>
              <button onClick={() => applyConsultDraft()} style={{ ...mono, fontSize: 11.5, marginTop: 9, color: GOLD, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                adicionar todos ao satélite →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function MissionWindow() {
  const {
    missionPlan, selectFramework, setMissionKind, selectObjective,
    setPlanName, setBudget, comingSoon, setFormat,
    setCustomDescription, setTeamField, setPriorities, enterHardware,
  } = useForge()
  const kind = missionPlan.kind || null
  const isCompetition = kind === 'competition'

  // dynamic step list — competition path has the extra "competição" step
  const stepDefs = [
    { id: 'context', title: 'tipo de missão' },
    ...(isCompetition || kind == null ? [{ id: 'competition', title: 'competição' }] : []),
    { id: 'format', title: 'formato' },
    { id: 'objective', title: 'objetivo' },
    { id: 'team', title: 'equipe' },
    { id: 'constraints', title: 'restrições' },
    { id: 'identity', title: 'identidade' },
  ]
  const steps = stepDefs.map(s => s.title)
  const idx = (id) => stepDefs.findIndex(s => s.id === id)

  // resume at the first incomplete decision
  const firstIncomplete = !kind ? 0
    : (isCompetition && !missionPlan.frameworkId) ? idx('competition')
    : !missionPlan.format ? idx('format')
    : (!missionPlan.objectiveId && !(missionPlan.custom?.description || '').trim()) ? idx('objective')
    : !(missionPlan.team?.name || '').trim() ? idx('team')
    : (missionPlan.budgetBRL == null && !(missionPlan.priorities || '').trim()) ? idx('constraints')
    : idx('identity')
  const [step, setStep] = useState(Math.max(0, firstIncomplete))
  const [asmW, setAsmW] = usePanelWidth('forge.missionAsmW', 300, 220, 460)

  const complete = !!kind && !!missionPlan.format && (!!missionPlan.objectiveId || !!(missionPlan.custom?.description || '').trim()) && missionPlan.name.trim().length >= 2
  const competitions = FRAMEWORK_LIST.filter(f => f.kind === 'competition')
  const fw = getFramework(missionPlan.frameworkId)
  const resolved = resolveObjective(missionPlan)

  const go = (id) => setStep(idx(id))
  const chooseKind = (k) => {
    if (k !== 'competition') { selectFramework('custom'); setMissionKind(k); go('format') }
    else { setMissionKind('competition'); track('onboarding', { action: 'kind_competition' }); setStep(1) }
  }
  const chooseCompetition = (id) => { selectFramework(id); setMissionKind('competition'); go('format') }

  const screensById = {}
  screensById.context = (
    <>
      <h2 style={h2}>Que tipo de missão você vai voar?</h2>
      <p style={sub}>Isso define as regras de validação e as recomendações que o consultor aplica ao seu projeto.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(260px, 320px))', gap: 16, justifyContent: 'center' }}>
        {MISSION_KINDS.map(k => (
          <Card key={k.id} width="100%" selected={kind === k.id} onClick={() => chooseKind(k.id)}>
            <div style={{ ...mono, fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: GOLD, marginBottom: 7 }}>{k.tag}</div>
            <div style={{ ...slab, fontSize: 22, fontWeight: 700, marginBottom: 5 }}>{k.label}</div>
            <div style={{ fontSize: 14.5, lineHeight: 1.5, color: 'var(--poster-fg-dim)' }}>{k.desc}</div>
          </Card>
        ))}
      </div>
    </>
  )
  screensById.competition = (
    <>
      <h2 style={h2}>Qual competição?</h2>
      <p style={sub}>Os requisitos oficiais (massa, telemetria, enlace) entram direto na validação do projeto.</p>
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
        {competitions.map(f => (
          <Card key={f.id} selected={missionPlan.frameworkId === f.id} onClick={() => chooseCompetition(f.id)}>
            <div style={{ ...slab, fontSize: 23, fontWeight: 700, marginBottom: 4 }}>{f.name}</div>
            <div style={{ ...mono, fontSize: 12, color: GOLD, marginBottom: 8 }}>{f.full}</div>
            <div style={{ fontSize: 14, lineHeight: 1.45, color: 'var(--poster-fg-dim)' }}>{f.tagline}</div>
          </Card>
        ))}
        {COMING_SOON_FRAMEWORKS.map(f => (
          <Card key={f.id} onClick={(e) => comingSoon(f.name, e.currentTarget, `framework_${f.id}`)}>
            <div style={{ ...slab, fontSize: 23, fontWeight: 700, marginBottom: 4, opacity: .65 }}>{f.name}</div>
            <div style={{ ...mono, fontSize: 12, color: 'var(--poster-fg-dim)', marginBottom: 8 }}>{f.full}</div>
            <div style={{ fontSize: 14, lineHeight: 1.45, color: 'var(--poster-fg-dim)' }}>{f.tagline}</div>
          </Card>
        ))}
      </div>
    </>
  )
  screensById.format = (
    <>
      <h2 style={h2}>Qual o formato do satélite?</h2>
      <p style={sub}>O formato fixa os orçamentos de massa, volume e energia que você acompanha o tempo todo.</p>
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
        {OBSAT_FORMAT_LIST.map(f => (
          <Card key={f.id} selected={missionPlan.format === f.id} onClick={() => { setFormat(f.id); go('objective') }}>
            <div style={{ ...slab, fontSize: 21, fontWeight: 700, marginBottom: 4 }}>{f.label}</div>
            <div style={{ ...mono, fontSize: 12, color: GOLD, marginBottom: 8 }}>≤ {f.massMaxG} g</div>
            <div style={{ ...mono, fontSize: 12, lineHeight: 1.45, color: 'var(--poster-fg-dim)' }}>{f.sizeNote}</div>
          </Card>
        ))}
      </div>
    </>
  )
  screensById.objective = (
    <>
      <h2 style={h2}>O que a missão vai medir ou fazer?</h2>
      <p style={sub}>Escolha um objetivo de partida e/ou descreva em texto livre — o consultor sugere os sensores.</p>
      <div style={{ width: 540, maxWidth: '100%', margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          {OBJECTIVES.filter(o => o.id !== 'custom').map(o => (
            <Card key={o.id} width="100%" selected={missionPlan.objectiveId === o.id} onClick={() => selectObjective(o.id)}>
              <div style={{ ...slab, fontSize: 17, fontWeight: 700, marginBottom: 4 }}>{o.label}</div>
              <div style={{ fontSize: 13, lineHeight: 1.4, color: 'var(--poster-fg-dim)' }}>{o.desc}</div>
            </Card>
          ))}
        </div>
        <label style={label}>descreva a missão (opcional)
          <textarea value={missionPlan.custom?.description || ''} onChange={e => setCustomDescription(e.target.value)}
            placeholder="ex.: medir o perfil de temperatura e pressão na subida e estimar o movimento do satélite com IMU"
            rows={3} style={{ ...inputStyle, marginTop: 6, resize: 'vertical', lineHeight: 1.5 }} />
        </label>
        <ConsultantPanel />
      </div>
    </>
  )
  screensById.team = (
    <>
      <h2 style={h2}>Quem é a equipe?</h2>
      <p style={sub}>O contexto da equipe ajusta as recomendações — descreva a situação e o consultor adapta os tradeoffs.</p>
      <div style={{ width: 460, maxWidth: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label style={label}>nome da equipe
            <input value={missionPlan.team?.name || ''} onChange={e => setTeamField('name', e.target.value)} placeholder="ex.: Equipe Zênite" style={inputStyle} />
          </label>
          <label style={label}>instituição
            <input value={missionPlan.team?.institution || ''} onChange={e => setTeamField('institution', e.target.value)} placeholder="ex.: UFMG" style={inputStyle} />
          </label>
        </div>
        <label style={label}>tamanho da equipe
          <input value={missionPlan.team?.size || ''} onChange={e => setTeamField('size', e.target.value)} placeholder="ex.: 4 integrantes" style={inputStyle} />
        </label>
        <label style={label}>situação da equipe (texto livre)
          <textarea value={missionPlan.team?.situationText || ''} onChange={e => setTeamField('situationText', e.target.value)}
            placeholder="ex.: equipe pequena, primeira vez na OBSAT, com outro projeto em paralelo e orçamento apertado"
            rows={3} style={{ ...inputStyle, marginTop: 6, resize: 'vertical', lineHeight: 1.5 }} />
        </label>
        <ConsultantPanel />
      </div>
    </>
  )
  screensById.constraints = (
    <>
      <h2 style={h2}>Restrições e prioridades</h2>
      <p style={sub}>O orçamento alimenta o medidor de custos; as prioridades guiam as recomendações.</p>
      <div style={{ width: 420, maxWidth: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label style={label}>orçamento total (R$ · opcional)
          <input type="number" value={missionPlan.budgetBRL ?? ''} onChange={e => setBudget(e.target.value)} placeholder="ex.: 300" style={inputStyle} />
        </label>
        <label style={label}>prioridades e restrições conhecidas (opcional)
          <textarea value={missionPlan.priorities || ''} onChange={e => setPriorities(e.target.value)}
            placeholder="ex.: priorizar robustez da telemetria; já temos uma bateria; prazo curto para integração"
            rows={3} style={{ ...inputStyle, marginTop: 6, resize: 'vertical', lineHeight: 1.5 }} />
        </label>
      </div>
    </>
  )
  screensById.identity = (
    <>
      <h2 style={h2}>Dê um nome à missão</h2>
      <p style={sub}>Quase lá — depois disso você vai direto para o hardware com um rascunho pronto.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: 380, margin: '0 auto' }}>
        <label style={label}>nome da missão
          <input value={missionPlan.name} onChange={e => setPlanName(e.target.value)} placeholder="ex.: ARARA-1" style={inputStyle} autoFocus />
        </label>
        <AdvancedOptions />
        <button onClick={() => { track('onboarding', { action: 'to_hardware' }); enterHardware() }}
          disabled={missionPlan.name.trim().length < 2}
          style={{ ...primaryBtn, marginTop: 10, opacity: missionPlan.name.trim().length < 2 ? .45 : 1 }}>
          Continuar para o hardware →
        </button>
      </div>
    </>
  )

  const current = stepDefs[Math.min(step, stepDefs.length - 1)]

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '20px 36px 22px', background: NAVY_FIELD, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...slab, fontSize: 22, fontWeight: 700, color: CREAM }}>Definição da missão</div>
          <div style={{ ...mono, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--poster-fg-dim)' }}>
            {complete && fw && resolved
              ? `${missionPlan.name} · ${fw.name} · ${resolved.label}`
              : 'o consultor pensa junto com você — o hardware vem depois'}
          </div>
        </div>
        <StepDots steps={steps} current={Math.min(step, steps.length - 1)} />
        {complete ? (
          <button onClick={() => enterHardware()} style={{ ...mono, fontSize: 13, letterSpacing: '.04em', color: 'var(--poster-bg-solid)', background: GOLD, border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontWeight: 700 }}>ir para o hardware →</button>
        ) : <span style={{ width: 10 }} />}
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0, gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '20px 0' }}>
          <div>{screensById[current.id]}</div>
        </div>
        <PanelDivider w={asmW} setW={setAsmW} side="left" />
        <div style={{ width: asmW, flexShrink: 0, borderLeft: '1px solid var(--poster-line)', padding: '10px 4px 6px 14px', minHeight: 0 }}>
          <SatelliteAssembly plan={missionPlan} />
        </div>
      </div>

      <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'center', gap: 22 }}>
        {step > 0 && (
          <button onClick={() => setStep(s => Math.max(0, s - 1))} style={{ ...mono, fontSize: 13, color: 'var(--poster-fg-dim)', background: 'none', border: 'none', cursor: 'pointer' }}>← voltar</button>
        )}
        {step < steps.length - 1 && kind != null && (
          <button onClick={() => setStep(s => Math.min(steps.length - 1, s + 1))} style={{ ...mono, fontSize: 13, color: 'var(--poster-fg-dim)', background: 'none', border: 'none', cursor: 'pointer' }}>avançar →</button>
        )}
      </div>
    </div>
  )
}
