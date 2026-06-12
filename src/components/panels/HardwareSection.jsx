import { useState } from 'react'
import useForge, { COMPONENT_DEFS } from '../../store/useForge'
import {
  getFramework, resolveObjective, FRAMEWORK_LIST, COMING_SOON_FRAMEWORKS, OBJECTIVES,
  SOURCE_LABEL, effectiveProps,
} from '../../mission/index.js'
import { MISSION_KINDS } from '../onboarding/posterKit.jsx'
import { track } from '../../lib/analytics.js'
import HardwareViews, { ViewToggle } from '../canvas/HardwareViews'
import CatGlyph from '../ui/catGlyphs'

// ──────────────────────────────────────────────────────────────────
// Hardware window — HOW the mission is built.
//
// The mission context (type, framework, objective, name, budget) is
// defined ONCE in the Mission window and shown here as a read-only
// summary card with an "editar missão" link — this window never
// re-asks for it. Its own stages are the hardware decisions:
// component selection and wiring.
//
// Left: collapsible stages connected by a flow rail. The first
// incomplete stage opens automatically; completed stages collapse to a
// one-line summary of what was configured (no need to reopen them).
// Center: the live hardware view (3D board or 2D schematic) — always
// visible, always reflecting the real state of the design.
// ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: "'Space Mono', monospace" }
const SEV_COLOR = { error: 'var(--err2)', warn: 'var(--warn2)', info: 'var(--ink3)' }

// ── collapsible stage with flow rail ──────────────────────────────
function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function Stage({ n, title, done, open, onToggle, summary, last, children, onConfirm, canConfirm, confirmLabel, onEdit }) {
  return (
    <div style={{ position: 'relative', paddingBottom: last ? 0 : 14 }}>
      {/* flow rail connecting the stage markers */}
      {!last && (
        <div style={{
          position: 'absolute', left: 7.5, top: 20, bottom: -2, width: 1,
          background: done ? 'var(--ok2)' : 'var(--paper4)', opacity: done ? 0.5 : 1,
        }} />
      )}

      <button onClick={onToggle} style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
        border: 'none', background: 'none', cursor: 'pointer', padding: 0, marginBottom: open ? 8 : 2,
      }}>
        <span style={{
          width: 16, height: 16, borderRadius: '50%', flexShrink: 0, ...mono, fontSize: 11,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700,
          background: done ? 'var(--ok2)' : open ? 'var(--acc)' : 'var(--paper4)',
          color: done || open ? 'var(--btn-fg)' : 'var(--ink3)', zIndex: 1, position: 'relative',
        }}>{done ? '✓' : n}</span>
        <span style={{ ...mono, fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: open ? 'var(--ink2)' : 'var(--ink3)', flexShrink: 0 }}>{title}</span>
        <span style={{ flex: 1 }} />
        <span style={{ ...mono, fontSize: 12, color: 'var(--ink4)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}>›</span>
      </button>

      {/* collapsed: only the one-line summary + a minimal edit pencil */}
      {!open && summary && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '2px 0 2px 24px' }}>
          <span style={{ flex: 1, fontSize: 13, color: 'var(--ink3)', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</span>
          {onEdit && (
            <button onClick={(e) => { e.stopPropagation(); onEdit(e.currentTarget) }} title="Editar"
              style={{
                flexShrink: 0, width: 20, height: 20, padding: 0, borderRadius: 4, cursor: 'pointer',
                border: '1px solid var(--rule)', background: 'var(--paper)', color: 'var(--ink3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}><PencilIcon /></button>
          )}
        </div>
      )}

      {/* smooth expand/retract */}
      <div style={{
        display: 'grid', gridTemplateRows: open ? '1fr' : '0fr',
        transition: 'grid-template-rows .28s cubic-bezier(.4,0,.2,1)',
      }}>
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
          <div style={{ paddingLeft: 24 }}>
            {children}
            {onConfirm && (
              <div style={{ marginTop: 11 }}>
                <button
                  onClick={onConfirm} disabled={!canConfirm}
                  style={{
                    padding: '6px 14px', borderRadius: 5, border: 'none',
                    cursor: canConfirm ? 'pointer' : 'not-allowed',
                    background: canConfirm ? 'var(--btn-bg)' : 'var(--paper4)',
                    color: canConfirm ? 'var(--btn-fg)' : 'var(--ink4)',
                    fontSize: 13.5, fontFamily: "'Space Grotesk', sans-serif",
                  }}
                >{confirmLabel}</button>
                {!canConfirm && (
                  <div style={{ ...mono, fontSize: 12, color: 'var(--ink4)', marginTop: 5 }}>complete este estágio para avançar</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── inline mission-definition editors (the pipeline edits in-page) ──
// The mission is DEFINED here, on the Hardware page, through the same
// pipeline as the hardware stages — no trip back to the Mission window.
// Each editor writes straight to the store; the stage's `done` recomputes.
const selRow = (sel) => ({
  display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
  padding: '8px 10px', borderRadius: 'var(--r-md)', marginBottom: 5,
  border: `1px solid ${sel ? 'var(--acc)' : 'var(--rule)'}`,
  background: sel ? 'rgba(158,74,44,.07)' : 'var(--paper)',
  fontFamily: "'Space Grotesk', sans-serif",
})

function KindEditor() {
  const { missionPlan, setMissionKind, selectFramework } = useForge()
  const kind = missionPlan.kind || null
  const choose = (k) => { if (k !== 'competition') { selectFramework('custom'); setMissionKind(k) } else setMissionKind(k) }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
      {MISSION_KINDS.map(k => {
        const sel = kind === k.id
        return (
          <button key={k.id} onClick={() => choose(k.id)} style={{ ...selRow(sel), marginBottom: 0, padding: '9px 10px' }}>
            <span style={{ ...mono, fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: sel ? 'var(--acc)' : 'var(--ink4)' }}>{k.tag}</span>
          </button>
        )
      })}
    </div>
  )
}

function FrameworkEditor() {
  const { missionPlan, selectFramework, setMissionKind, comingSoon } = useForge()
  const comps = FRAMEWORK_LIST.filter(f => f.kind === 'competition')
  return (
    <div>
      {comps.map(f => {
        const sel = missionPlan.frameworkId === f.id
        return (
          <button key={f.id} onClick={() => { selectFramework(f.id); setMissionKind('competition') }} style={selRow(sel)}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{f.name}</span>
            <span style={{ display: 'block', ...mono, fontSize: 10.5, color: 'var(--ink4)', marginTop: 1 }}>{f.full}</span>
          </button>
        )
      })}
      {COMING_SOON_FRAMEWORKS.map(f => (
        <button key={f.id} onClick={(e) => comingSoon(f.name, e.currentTarget, `framework_${f.id}`)} style={{ ...selRow(false), opacity: 0.6 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{f.name}</span>
          <span style={{ display: 'block', ...mono, fontSize: 10.5, color: 'var(--ink4)', marginTop: 1 }}>em breve</span>
        </button>
      ))}
    </div>
  )
}

function ObjectiveEditor() {
  const { missionPlan, selectObjective } = useForge()
  return (
    <div>
      {OBJECTIVES.map(o => {
        const sel = missionPlan.objectiveId === o.id
        return (
          <button key={o.id} onClick={() => selectObjective(o.id)} style={selRow(sel)}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{o.label}</span>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--ink4)', lineHeight: 1.4, marginTop: 2 }}>{o.desc}</span>
          </button>
        )
      })}
    </div>
  )
}

function IdentityEditor() {
  const { missionPlan, setPlanName, setBudget } = useForge()
  const field = { width: '100%', padding: '7px 10px', borderRadius: 'var(--r-md)', outline: 'none', border: '1px solid var(--rule)', background: 'var(--paper)', fontSize: 14, color: 'var(--ink)', fontFamily: "'Space Grotesk', sans-serif" }
  const label = { ...mono, fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink4)', display: 'block', marginBottom: 4 }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label style={label}>nome da missão
        <input value={missionPlan.name} onChange={e => setPlanName(e.target.value)} placeholder="ex.: ARARA-1" style={{ ...field, marginTop: 4 }} />
      </label>
      <label style={label}>orçamento (R$ · opcional)
        <input type="number" value={missionPlan.budgetBRL ?? ''} onChange={e => setBudget(e.target.value)} placeholder="ex.: 300" style={{ ...field, marginTop: 4 }} />
      </label>
    </div>
  )
}

// ── stage 4 · hardware ────────────────────────────────────────────
const CAT_LABELS = { mcu: 'Processamento', sensor: 'Sensores', comm: 'Comunicação', storage: 'Armazenamento', power: 'Energia' }
const CAT_ORDER = ['mcu', 'sensor', 'comm', 'storage', 'power']

function HardwareStage() {
  const { entities, missionPlan, toggleHardware, selectEntity } = useForge()
  const groups = {}
  Object.values(COMPONENT_DEFS).forEach(d => { (groups[d.category] ||= []).push(d) })

  return (
    <>
      {CAT_ORDER.filter(c => groups[c]).map(cat => (
        <div key={cat} style={{ marginBottom: 12 }}>
          <div style={{ ...mono, fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 6 }}>{CAT_LABELS[cat]}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {groups[cat]
              .sort((a, b) => (a.comingSoon ? 1 : 0) - (b.comingSoon ? 1 : 0))
              .map(d => {
                const placed = !!entities[d.id]
                const eff = effectiveProps(d, missionPlan.overrides[d.id])
                const soon = !!d.comingSoon
                return (
                  <button key={d.id}
                    onClick={(e) => toggleHardware(d.id, e.currentTarget)}
                    onDoubleClick={() => placed && selectEntity(d.id)}
                    title={soon ? d.label : placed ? `${d.label} · remover · duplo clique inspeciona` : `${d.label} · adicionar`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', width: '100%',
                      padding: '8px 10px', borderRadius: 'var(--r-md)', cursor: 'pointer',
                      border: `1px solid ${placed ? 'var(--ok2)' : 'var(--rule)'}`,
                      background: placed ? 'rgba(58,144,96,.07)' : 'var(--paper)',
                      opacity: soon ? 0.55 : 1, transition: 'all .15s',
                    }}>
                    {/* CAD glyph — colour carries the placed state (no checkbox) */}
                    <CatGlyph cat={cat} size={22} color={placed ? 'var(--ok2)' : 'var(--ink3)'} />
                    {/* name beside the icon, part nº in mono underneath */}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--ink)', lineHeight: 1.2 }}>{d.friendly}</span>
                      <span style={{ display: 'block', ...mono, fontSize: 10.5, color: 'var(--ink4)', marginTop: 1 }}>{d.label}</span>
                    </span>
                    <span style={{ ...mono, fontSize: 11, color: placed ? 'var(--ok2)' : 'var(--ink4)', flexShrink: 0 }}>{soon ? 'em breve' : `R$${eff.price}`}</span>
                  </button>
                )
              })}
          </div>
        </div>
      ))}
    </>
  )
}

// ── stage 5 · wiring summary (drives users to the 2D editor) ──────
function WiringStage() {
  const { entities, live, setHardwareView, autoWire } = useForge()
  const sensors = Object.keys(entities).filter(id => id !== 'esp32')
  return (
    <>
      {sensors.length === 0 && (
        <div style={{ fontSize: 13.5, color: 'var(--ink4)', marginBottom: 6 }}>Adicione sensores primeiro.</div>
      )}
      {sensors.map(id => {
        const st = live?.wiring?.[id]
        return (
          <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 9px', borderRadius: 5, marginBottom: 4, border: '1px solid var(--rule)', background: 'var(--paper)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: st?.wired ? 'var(--ok2)' : 'var(--ink4)' }} />
            <span style={{ flex: 1, fontSize: 13.5, color: 'var(--ink)' }}>{entities[id].def.label}</span>
            {st?.wired
              ? <span style={{ ...mono, fontSize: 11, color: 'var(--ok2)' }}>conectado</span>
              : <button onClick={() => autoWire(id)} style={{
                  ...mono, fontSize: 11, color: 'var(--acc)', cursor: 'pointer',
                  border: '1px solid var(--rule)', background: 'var(--paper2)', borderRadius: 3, padding: '2px 7px',
                }}>auto-conectar</button>}
          </div>
        )
      })}
      <button onClick={() => setHardwareView('2d')} style={{
        width: '100%', padding: '7px 10px', borderRadius: 5, marginTop: 4, cursor: 'pointer',
        border: 'none', background: 'var(--btn-bg)', color: 'var(--btn-fg)',
        fontSize: 13.5, fontFamily: "'Space Grotesk', sans-serif",
      }}>Abrir editor de fiação 2D →</button>
      <div style={{ ...mono, fontSize: 11, color: 'var(--ink4)', lineHeight: 1.5, marginTop: 6 }}>
        Conecte os pinos manualmente no esquema 2D — a validação elétrica acontece em tempo real e o firmware usa os pinos que você ligar.
      </div>
    </>
  )
}

// ── live validation notifications (compact, source-tagged) ────────
function ValidationNotices() {
  const { live, toggleHardware, entities } = useForge()
  const validation = live?.validation
  if (!validation || validation.issues.length === 0) return null

  const shown = validation.issues.filter(i => i.severity !== 'info').slice(0, 4)
  if (!shown.length) return null

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ ...mono, fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 6 }}>
        Validação ao vivo
      </div>
      {shown.map((iss, i) => (
        <div key={i} style={{
          border: '1px solid var(--rule)',
          background: iss.severity === 'error' ? 'rgba(184,75,44,.06)' : 'rgba(200,131,26,.06)',
          borderRadius: 'var(--r-md)', padding: '7px 10px', marginBottom: 6,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: SEV_COLOR[iss.severity] }} />
            <span style={{ ...mono, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink4)', flexShrink: 0 }}>{SOURCE_LABEL[iss.source] || iss.source}</span>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{iss.title}</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.45 }}>{iss.detail}</div>
          {iss.suggestions?.filter(s => !entities[s.id]).slice(0, 2).map(s => (
            <button key={s.id} onClick={() => toggleHardware(s.id)} style={{
              fontSize: 13, cursor: 'pointer', padding: '3px 8px', borderRadius: 4, marginTop: 5, marginRight: 5,
              border: '1px solid var(--rule)', background: 'var(--paper)', color: 'var(--ink2)',
              fontFamily: "'Space Grotesk', sans-serif",
            }}>+ {COMPONENT_DEFS[s.id]?.friendly || s.label}</button>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── progress footer ───────────────────────────────────────────────
function ProgressFooter() {
  const { missionPlan, entities, live, saveMissionDraft } = useForge()
  const wiredAll = Object.keys(entities).length > 0 &&
    Object.keys(entities).every(id => live?.wiring?.[id]?.wired)
  let pct = 0
  if (missionPlan.frameworkId) pct += 20
  if (missionPlan.objectiveId) pct += 20
  if (missionPlan.name.trim().length >= 2) pct += 10
  if (Object.keys(entities).length >= 2) pct += 20
  if (wiredAll) pct += 15
  if (live?.validation?.ok && Object.keys(entities).length > 0) pct += 15
  const color = pct >= 80 ? 'var(--ok2)' : pct >= 50 ? 'var(--warn2)' : 'var(--err2)'
  return (
    <div style={{ padding: '9px 14px 11px', borderTop: '1px solid var(--rule)', flexShrink: 0, background: 'var(--paper2)' }}>
      <button onClick={saveMissionDraft} disabled={!missionPlan.frameworkId} style={{
        width: '100%', marginBottom: 9, padding: '6px 10px', borderRadius: 5,
        border: '1px solid var(--rule)', cursor: missionPlan.frameworkId ? 'pointer' : 'not-allowed',
        background: 'var(--paper)', color: missionPlan.frameworkId ? 'var(--ink2)' : 'var(--ink4)',
        ...mono, fontSize: 12, letterSpacing: '.04em',
      }}>Salvar rascunho</button>
      <div style={{ display: 'flex', justifyContent: 'space-between', ...mono, fontSize: 11, color: 'var(--ink4)', marginBottom: 4 }}>
        <span>PROGRESSO DA MISSÃO</span><span>{pct}%</span>
      </div>
      <div style={{ height: 4, background: 'var(--rule)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: color, transition: 'width .4s, background .4s' }} />
      </div>
    </div>
  )
}

// ── canvas area (always live, 2D/3D) ──────────────────────────────
function BuilderCanvas() {
  const { entities, missionPlan, live, hwLink } = useForge()
  const empty = Object.keys(entities).length === 0
  const eco = live?.eco || { massG: 0, priceBRL: 0, currentmA: 0 }
  const v = live?.validation
  const wired = Object.keys(entities).filter(id => live?.wiring?.[id]?.wired).length

  return (
    <div style={{ flex: 1, position: 'relative', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      {/* breadcrumb strip */}
      <div style={{
        height: 34, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px',
        background: 'var(--paper2)', borderBottom: '1px solid var(--rule)',
      }}>
        <span style={{ ...mono, fontSize: 12, letterSpacing: '.08em', color: 'var(--ink3)' }}>
          {missionPlan.frameworkId ? getFramework(missionPlan.frameworkId)?.name : 'Missão'}
        </span>
        {missionPlan.name?.trim() && (
          <>
            <span style={{ color: 'var(--ink4)', fontSize: 13 }}>›</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{missionPlan.name}</span>
          </>
        )}
        <span style={{
          ...mono, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase',
          padding: '1px 6px', borderRadius: 2, marginLeft: 4,
          background: hwLink.connected ? 'rgba(58,144,96,.12)' : 'rgba(26,24,20,.06)',
          color: hwLink.connected ? 'var(--ok2)' : 'var(--ink4)',
        }}>{hwLink.connected ? 'hardware real' : 'simulação'}</span>
        <div style={{ flex: 1 }} />
        <ViewToggle />
      </div>

      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <HardwareViews showToggle={false} />

        {empty && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -40%)',
            textAlign: 'center', pointerEvents: 'none',
            background: 'var(--paper2)', border: '1px solid var(--rule)',
            borderRadius: 8, padding: '14px 22px',
          }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink3)', marginBottom: 4 }}>Placa vazia</div>
            <div style={{ ...mono, fontSize: 12, color: 'var(--ink4)' }}>
              adicione componentes no painel ao lado
            </div>
          </div>
        )}
      </div>

      {/* live economics + honest wiring statusline */}
      <div style={{
        height: 24, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px',
        background: 'var(--paper3)', borderTop: '1px solid var(--rule)',
        ...mono, fontSize: 11, color: 'var(--ink4)',
      }}>
        {v && (
          <>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: v.summary.errors ? 'var(--err2)' : 'var(--ok2)' }} />
              {v.summary.errors ? `${v.summary.errors} erro${v.summary.errors > 1 ? 's' : ''}` : 'requisitos ok'}
            </span>
            {v.summary.warnings > 0 && <span style={{ color: 'var(--warn2)' }}>{v.summary.warnings} aviso{v.summary.warnings > 1 ? 's' : ''}</span>}
          </>
        )}
        {Object.keys(entities).length > 0 && (
          <span>{wired}/{Object.keys(entities).length} conectados</span>
        )}
        <div style={{ flex: 1 }} />
        <span>{eco.massG} g</span><span>·</span>
        <span>{eco.currentmA.toFixed(0)} mA</span><span>·</span>
        <span style={{ color: missionPlan.budgetBRL && eco.priceBRL > missionPlan.budgetBRL ? 'var(--err2)' : 'var(--ink4)' }}>
          R$ {eco.priceBRL}{missionPlan.budgetBRL ? ` / ${missionPlan.budgetBRL}` : ''}
        </span>
      </div>
    </div>
  )
}

// ── main section ──────────────────────────────────────────────────
export default function HardwareSection() {
  const { entities, live, missionPlan, loadMissionDraft, setSection, markFirstStageConfirmed } = useForge()
  const eco = live?.eco || { massG: 0, priceBRL: 0 }
  const sensors = Object.keys(entities).filter(id => id !== 'esp32')
  const wiredAll = Object.keys(entities).length > 0 &&
    Object.keys(entities).every(id => live?.wiring?.[id]?.wired)

  // ONE pipeline, edited in place: the mission is DEFINED here (type →
  // competition → objective → identity) and BUILT here (hardware → wiring)
  // — no trip back to the Mission window. Each stage writes to the store.
  const kind = missionPlan.kind || null
  const isCompetition = kind === 'competition'
  const fw = getFramework(missionPlan.frameworkId)
  const resolvedObj = resolveObjective(missionPlan)
  const stages = [
    {
      id: 'kind', title: 'Tipo de missão', done: !!kind,
      summary: kind ? (MISSION_KINDS.find(k => k.id === kind)?.tag || kind) : null,
      el: <KindEditor />, enabled: true,
    },
    {
      id: 'framework', title: 'Competição', done: !!missionPlan.frameworkId,
      summary: fw ? fw.name : null,
      el: <FrameworkEditor />, enabled: isCompetition,
    },
    {
      id: 'objective', title: 'Objetivo', done: !!missionPlan.objectiveId,
      summary: resolvedObj ? resolvedObj.label : null,
      el: <ObjectiveEditor />, enabled: !!kind,
    },
    {
      id: 'identity', title: 'Identidade', done: missionPlan.name?.trim().length >= 2,
      summary: missionPlan.name?.trim()
        ? `${missionPlan.name.trim()}${missionPlan.budgetBRL ? ` · R$ ${missionPlan.budgetBRL}` : ''}`
        : null,
      el: <IdentityEditor />, enabled: !!kind,
    },
    {
      id: 'hw', title: 'Hardware', done: Object.keys(entities).length >= 2,
      summary: Object.keys(entities).length
        ? `${Object.keys(entities).length} módulos · ${eco.massG} g · R$ ${eco.priceBRL}`
        : null,
      el: <HardwareStage />,
      enabled: true,
    },
    {
      id: 'wire', title: 'Fiação', done: wiredAll && sensors.length > 0,
      summary: sensors.length
        ? `${sensors.filter(id => live?.wiring?.[id]?.wired).length}/${sensors.length} sensores conectados`
        : null,
      el: <WiringStage />,
      enabled: Object.keys(entities).length > 0,
    },
  ].filter(s => s.enabled)

  // Confirm-driven flow: a stage only collapses when the user explicitly
  // confirms/advances it — never just because a field was filled. The open
  // stage is the first one not yet confirmed (or any stage opened manually).
  const [manual, setManual] = useState({})
  // collapse stages already complete on mount (e.g. arriving from the mission
  // flow with everything defined) so the OPEN stage is the first incomplete
  // one — Hardware — instead of re-asking to confirm from the top.
  const [confirmed, setConfirmed] = useState(() => {
    const s = useForge.getState()
    const mp = s.missionPlan
    const ents = Object.keys(s.entities).length
    const c = {}
    if (mp.kind) c.kind = true
    if (mp.frameworkId) c.framework = true
    if (mp.objectiveId) c.objective = true
    if ((mp.name || '').trim().length >= 2) c.identity = true
    if (ents >= 2) c.hw = true
    return c
  })
  const activeId = stages.find(s => !confirmed[s.id])?.id ?? null
  const isOpen = (id) => manual[id] ?? (id === activeId)
  const toggle = (id) => {
    const willOpen = !isOpen(id)
    track('stage_toggle', { stageId: id, action: willOpen ? 'expand' : 'collapse' })
    setManual(m => ({ ...m, [id]: willOpen }))
  }
  const confirmStage = (id) => {
    track('stage_toggle', { stageId: id, action: 'confirm' })
    markFirstStageConfirmed()
    setConfirmed(c => ({ ...c, [id]: true }))
    setManual(m => { const next = { ...m }; delete next[id]; return next })
  }

  // Draft restore banner — read once; never auto-restores. Only offered on a
  // fresh start (no mission in progress): a saved draft is relevant after a
  // restart, NOT right after the user just created a mission.
  const [draft, setDraft] = useState(() => {
    const s = useForge.getState()
    if (s.missionPlan.frameworkId || Object.keys(s.entities).length > 0) return null
    try { return JSON.parse(localStorage.getItem('forge_mission_draft')) } catch { return null }
  })
  const restoreDraft = () => {
    loadMissionDraft(draft)
    const p = draft.missionPlan || {}
    const conf = {}
    if ((p.components || []).filter(id => COMPONENT_DEFS[id]?.supported).length >= 2) conf.hw = true
    setConfirmed(conf); setManual({}); setDraft(null)
  }
  const discardDraft = () => { try { localStorage.removeItem('forge_mission_draft') } catch { /* ignore */ }; setDraft(null) }

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden', display: 'flex' }}>
      {/* config column — collapsible engineering flow */}
      <div style={{
        width: 292, flexShrink: 0, display: 'flex', flexDirection: 'column',
        background: 'var(--paper2)', borderRight: '1px solid var(--rule)',
      }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px' }}>
          {draft && (
            <div style={{
              marginBottom: 14, padding: '8px 10px', borderRadius: 6,
              border: '1px solid var(--rule)', background: 'var(--paper)',
            }}>
              <div style={{ fontSize: 13.5, color: 'var(--ink2)', lineHeight: 1.4, marginBottom: 6 }}>
                Rascunho salvo em {new Date(draft.savedAt).toLocaleString('pt-BR')} — deseja restaurar?
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={restoreDraft} style={{
                  padding: '4px 12px', borderRadius: 4, border: 'none', cursor: 'pointer',
                  background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontSize: 13,
                  fontFamily: "'Space Grotesk', sans-serif",
                }}>Restaurar</button>
                <button onClick={discardDraft} style={{
                  padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
                  border: '1px solid var(--rule)', background: 'transparent', color: 'var(--ink3)', fontSize: 13,
                  fontFamily: "'Space Grotesk', sans-serif",
                }}>Descartar</button>
              </div>
            </div>
          )}
          {stages.map((s, i) => (
            <Stage key={s.id} n={i + 1} title={s.title} done={s.done}
              open={isOpen(s.id)} onToggle={() => toggle(s.id)}
              summary={s.summary} last={i === stages.length - 1}
              canConfirm={s.done} onConfirm={() => confirmStage(s.id)}
              confirmLabel={i === stages.length - 1 ? 'Confirmar' : 'Confirmar e avançar'}
              onEdit={() => {
                // editing a confirmed stage is just reopening it — every
                // field is live-bound to the store, so edits apply inline
                track('stage_toggle', { stageId: s.id, action: 'edit' })
                setManual(m => ({ ...m, [s.id]: true }))
              }}>
              {s.el}
            </Stage>
          ))}
        </div>
        <ProgressFooter />
        {stages.length > 0 && stages[stages.length - 1].id === 'wire' && stages[stages.length - 1].done && (
          <div style={{ padding: '10px 14px', borderTop: '1px solid var(--rule)', flexShrink: 0, background: 'var(--paper2)' }}>
            <button onClick={() => setSection('serialtest')} style={{
              width: '100%', padding: '8px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontSize: 14,
              fontFamily: "'Space Grotesk', sans-serif",
            }}>Iniciar testes de hardware</button>
          </div>
        )}
      </div>

      {/* live hardware view */}
      <BuilderCanvas />
    </div>
  )
}
