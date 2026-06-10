import { useState } from 'react'
import useForge, { COMPONENT_DEFS } from '../../store/useForge'
import {
  FRAMEWORK_LIST, COMING_SOON_FRAMEWORKS, getFramework,
  OBJECTIVES, OBJECTIVE_META_FIELDS, resolveObjective,
  SOURCE_LABEL, effectiveProps,
} from '../../mission/index.js'
import { track } from '../../lib/analytics.js'
import HardwareViews, { ViewToggle } from '../canvas/HardwareViews'

// ──────────────────────────────────────────────────────────────────
// Mission builder — a systems-engineering flow, not a flat form.
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
          width: 16, height: 16, borderRadius: '50%', flexShrink: 0, ...mono, fontSize: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700,
          background: done ? 'var(--ok2)' : open ? 'var(--acc)' : 'var(--paper4)',
          color: done || open ? '#fff' : 'var(--ink3)', zIndex: 1, position: 'relative',
        }}>{done ? '✓' : n}</span>
        <span style={{ ...mono, fontSize: 8, letterSpacing: '.14em', textTransform: 'uppercase', color: open ? 'var(--ink2)' : 'var(--ink3)', flexShrink: 0 }}>{title}</span>
        <span style={{ flex: 1 }} />
        <span style={{ ...mono, fontSize: 9, color: 'var(--ink4)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}>›</span>
      </button>

      {/* collapsed: only the one-line summary + a minimal edit pencil */}
      {!open && summary && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '2px 0 2px 24px' }}>
          <span style={{ flex: 1, fontSize: 10.5, color: 'var(--ink3)', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</span>
          {onEdit && (
            <button onClick={(e) => { e.stopPropagation(); onEdit() }} title="Editar"
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
                    background: canConfirm ? 'var(--navy)' : 'var(--paper4)',
                    color: canConfirm ? 'rgba(255,255,255,.9)' : 'var(--ink4)',
                    fontSize: 11, fontFamily: "'Space Grotesk', sans-serif",
                  }}
                >{confirmLabel}</button>
                {!canConfirm && (
                  <div style={{ ...mono, fontSize: 9, color: 'var(--ink4)', marginTop: 5 }}>complete este estágio para avançar</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function MiniInput({ label, value, onChange, placeholder, type = 'text', prefix }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
      <span style={{ fontSize: 11, color: 'var(--ink3)', width: 68, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
        {prefix && <span style={{ ...mono, fontSize: 10, color: 'var(--ink4)' }}>{prefix}</span>}
        <input
          type={type} value={value ?? ''} placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          style={{
            flex: 1, minWidth: 0, padding: '5px 8px', borderRadius: 5, outline: 'none',
            border: '1px solid var(--rule)', background: 'var(--paper)',
            fontSize: 11, color: 'var(--ink)', fontFamily: "'Space Grotesk', sans-serif",
          }}
        />
      </div>
    </div>
  )
}

// ── stage 1 · competition ─────────────────────────────────────────
function CompetitionStage() {
  const { missionPlan, selectFramework, comingSoon } = useForge()
  const [showReqs, setShowReqs] = useState(false)
  const fw = getFramework(missionPlan.frameworkId)

  const selectable = FRAMEWORK_LIST.filter(f => f.kind === 'competition')
  const custom = FRAMEWORK_LIST.find(f => f.kind === 'custom')

  return (
    <>
      {[...selectable, ...COMING_SOON_FRAMEWORKS, custom].filter(Boolean).map(f => {
        const sel = missionPlan.frameworkId === f.id
        const soon = !!f.comingSoon
        return (
          <button key={f.id}
            onClick={() => soon ? comingSoon(f.name) : selectFramework(f.id)}
            title={f.full}
            style={{
              display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
              padding: '8px 10px', borderRadius: 6, marginBottom: 5,
              border: `1px solid ${sel ? 'var(--acc)' : 'var(--rule)'}`,
              background: sel ? 'rgba(43,94,167,.06)' : 'var(--paper)',
              cursor: 'pointer', transition: 'all .15s',
            }}>
            <span style={{
              width: 28, height: 28, borderRadius: 4, flexShrink: 0, background: 'var(--navy)',
              color: 'rgba(255,255,255,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              ...mono, fontSize: 9, fontWeight: 700,
            }}>{f.kind === 'custom' ? '✎' : f.name.slice(0, 2).toUpperCase()}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink)' }}>{f.name}</span>
              <span style={{ display: 'block', ...mono, fontSize: 8, color: 'var(--ink4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.kind === 'custom' ? 'missão livre' : f.full}
              </span>
            </span>
            {sel && <span style={{ color: 'var(--acc)', fontSize: 12 }}>✓</span>}
          </button>
        )
      })}

      {fw && fw.requirements?.length > 0 && (
        <>
          <button onClick={() => setShowReqs(v => !v)} style={{
            ...mono, fontSize: 9, letterSpacing: '.06em', color: 'var(--ink3)', cursor: 'pointer',
            border: 'none', background: 'none', padding: '4px 2px', marginTop: 2,
          }}>{showReqs ? '▾' : '▸'} {fw.requirements.length} requisitos da competição</button>
          {showReqs && fw.requirements.map(r => (
            <div key={r.id} style={{ display: 'flex', gap: 7, padding: '5px 2px', borderBottom: '1px solid var(--rule2)' }}>
              <span style={{ ...mono, fontSize: 7, letterSpacing: '.08em', textTransform: 'uppercase', color: SEV_COLOR[r.severity], width: 42, flexShrink: 0, paddingTop: 2 }}>
                {r.severity === 'error' ? 'obrig.' : r.severity === 'warn' ? 'forte' : 'info'}
              </span>
              <span style={{ fontSize: 11, color: 'var(--ink2)', lineHeight: 1.4 }}>{r.title}</span>
            </div>
          ))}
        </>
      )}
    </>
  )
}

// ── stage 2 · scientific objective ────────────────────────────────
function ObjectiveStage() {
  const { missionPlan, selectObjective, setObjectiveMetaField } = useForge()
  const [editing, setEditing] = useState(false)
  const resolved = resolveObjective(missionPlan)

  return (
    <>
      {OBJECTIVES.map(o => {
        const sel = missionPlan.objectiveId === o.id
        return (
          <div key={o.id} style={{ marginBottom: 5 }}>
            <button onClick={() => { selectObjective(o.id); setEditing(false) }} style={{
              display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%', textAlign: 'left',
              padding: '8px 10px', borderRadius: 6, cursor: 'pointer', transition: 'all .15s',
              border: `1px solid ${sel ? 'var(--warn2)' : 'var(--rule)'}`,
              background: sel ? 'rgba(200,131,26,.06)' : 'var(--paper)',
            }}>
              <span style={{
                width: 13, height: 13, borderRadius: '50%', flexShrink: 0, marginTop: 2,
                border: `1.5px solid ${sel ? 'var(--warn2)' : 'var(--ink4)'}`,
                background: sel ? 'var(--warn2)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{sel && <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#fff' }} />}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink)' }}>{o.label}</span>
                <span style={{ display: 'block', fontSize: 10, color: 'var(--ink3)', lineHeight: 1.45 }}>{o.desc}</span>
              </span>
            </button>

            {sel && (
              <div style={{ margin: '4px 0 2px 21px' }}>
                <button onClick={() => setEditing(v => !v)} style={{
                  ...mono, fontSize: 9, letterSpacing: '.06em', color: 'var(--acc)', cursor: 'pointer',
                  border: 'none', background: 'none', padding: '2px 0',
                }}>{editing ? '▾ metadados da missão' : '▸ ver / editar metadados'}</button>
                {editing && resolved && (
                  <div style={{ border: '1px solid var(--rule)', borderRadius: 5, background: 'var(--paper)', padding: '8px 10px', marginTop: 3 }}>
                    {OBJECTIVE_META_FIELDS.map(fld => (
                      <div key={fld.key} style={{ marginBottom: 6 }}>
                        <div style={{ ...mono, fontSize: 7, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 2 }}>{fld.label}</div>
                        <input
                          value={resolved.meta[fld.key] || ''}
                          onChange={e => setObjectiveMetaField(fld.key, e.target.value)}
                          placeholder="—"
                          style={{
                            width: '100%', padding: '4px 7px', borderRadius: 4, outline: 'none',
                            border: '1px solid var(--rule)', background: 'var(--paper2)',
                            fontSize: 11, color: 'var(--ink)', fontFamily: "'Space Grotesk', sans-serif",
                          }}
                        />
                      </div>
                    ))}
                    <div style={{ ...mono, fontSize: 8, color: 'var(--ink4)', lineHeight: 1.5 }}>
                      Esses metadados definem a categoria da missão e alimentam a validação, as recomendações e o firmware gerado.
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

// ── stage 3 · mission & constraints ───────────────────────────────
function DetailsStage() {
  const { missionPlan, setPlanName, setBudget } = useForge()
  return (
    <>
      <MiniInput label="Nome" value={missionPlan.name} onChange={setPlanName} placeholder="Ex.: PISCE-1" />
      <MiniInput label="Orçamento" type="number" prefix="R$" value={missionPlan.budgetBRL ?? ''} onChange={v => setBudget(v)} placeholder="Ex.: 300" />
      <div style={{ ...mono, fontSize: 8, color: 'var(--ink4)', lineHeight: 1.5, marginTop: 2 }}>
        O orçamento entra na validação. Preço, massa e consumo de cada módulo são editáveis no inspetor.
      </div>
    </>
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
        <div key={cat} style={{ marginBottom: 10 }}>
          <div style={{ ...mono, fontSize: 7, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 4 }}>{CAT_LABELS[cat]}</div>
          {groups[cat]
            .sort((a, b) => (a.comingSoon ? 1 : 0) - (b.comingSoon ? 1 : 0))
            .map(d => {
              const placed = !!entities[d.id]
              const eff = effectiveProps(d, missionPlan.overrides[d.id])
              return (
                <button key={d.id}
                  onClick={() => toggleHardware(d.id)}
                  onDoubleClick={() => placed && selectEntity(d.id)}
                  title={placed ? 'Clique para remover · duplo clique para inspecionar' : 'Clique para adicionar à placa'}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                    padding: '6px 9px', borderRadius: 5, marginBottom: 4, cursor: 'pointer',
                    border: `1px solid ${placed ? 'var(--ok2)' : 'var(--rule)'}`,
                    background: placed ? 'rgba(58,144,96,.07)' : 'var(--paper)',
                    transition: 'all .15s',
                  }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--ink)' }}>{d.friendly}</span>
                    <span style={{ display: 'block', ...mono, fontSize: 8, color: 'var(--ink4)' }}>
                      {d.label}{d.protocol && d.protocol !== 'MCU' ? ` · ${d.protocol}` : ''}
                    </span>
                  </span>
                  <span style={{ ...mono, fontSize: 9, color: 'var(--ink3)', flexShrink: 0 }}>R${eff.price}</span>
                  <span style={{
                    width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                    border: `1px solid ${placed ? 'var(--ok2)' : 'var(--ink4)'}`,
                    background: placed ? 'var(--ok2)' : 'transparent',
                    color: '#fff', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{placed ? '✓' : ''}</span>
                </button>
              )
            })}
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
        <div style={{ fontSize: 11, color: 'var(--ink4)', marginBottom: 6 }}>Adicione sensores primeiro.</div>
      )}
      {sensors.map(id => {
        const st = live?.wiring?.[id]
        return (
          <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 9px', borderRadius: 5, marginBottom: 4, border: '1px solid var(--rule)', background: 'var(--paper)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: st?.wired ? 'var(--ok2)' : 'var(--ink4)' }} />
            <span style={{ flex: 1, fontSize: 11, color: 'var(--ink)' }}>{entities[id].def.label}</span>
            {st?.wired
              ? <span style={{ ...mono, fontSize: 8, color: 'var(--ok2)' }}>conectado</span>
              : <button onClick={() => autoWire(id)} style={{
                  ...mono, fontSize: 8, color: 'var(--acc)', cursor: 'pointer',
                  border: '1px solid var(--rule)', background: 'var(--paper2)', borderRadius: 3, padding: '2px 7px',
                }}>auto-conectar</button>}
          </div>
        )
      })}
      <button onClick={() => setHardwareView('2d')} style={{
        width: '100%', padding: '7px 10px', borderRadius: 5, marginTop: 4, cursor: 'pointer',
        border: 'none', background: 'var(--navy)', color: 'rgba(255,255,255,.85)',
        fontSize: 11, fontFamily: "'Space Grotesk', sans-serif",
      }}>Abrir editor de fiação 2D →</button>
      <div style={{ ...mono, fontSize: 8, color: 'var(--ink4)', lineHeight: 1.5, marginTop: 6 }}>
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
      <div style={{ ...mono, fontSize: 8, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 6 }}>
        Validação ao vivo
      </div>
      {shown.map((iss, i) => (
        <div key={i} style={{
          borderLeft: `2px solid ${SEV_COLOR[iss.severity]}`,
          background: iss.severity === 'error' ? 'rgba(184,75,44,.06)' : 'rgba(200,131,26,.06)',
          borderRadius: 3, padding: '6px 9px', marginBottom: 6,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
            <span style={{
              ...mono, fontSize: 7, letterSpacing: '.08em', textTransform: 'uppercase',
              color: '#fff', background: SEV_COLOR[iss.severity], borderRadius: 2, padding: '1px 4px', flexShrink: 0,
            }}>{SOURCE_LABEL[iss.source] || iss.source}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink)' }}>{iss.title}</span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--ink3)', lineHeight: 1.45 }}>{iss.detail}</div>
          {iss.suggestions?.filter(s => !entities[s.id]).slice(0, 2).map(s => (
            <button key={s.id} onClick={() => toggleHardware(s.id)} style={{
              fontSize: 10, cursor: 'pointer', padding: '3px 8px', borderRadius: 4, marginTop: 5, marginRight: 5,
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
        ...mono, fontSize: 9.5, letterSpacing: '.04em',
      }}>Salvar rascunho</button>
      <div style={{ display: 'flex', justifyContent: 'space-between', ...mono, fontSize: 8, color: 'var(--ink4)', marginBottom: 4 }}>
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
  const { entities, missionPlan, live, exitFramework, hwLink } = useForge()
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
        <span style={{ ...mono, fontSize: 9, letterSpacing: '.08em', color: 'var(--ink3)' }}>
          {missionPlan.frameworkId ? getFramework(missionPlan.frameworkId)?.name : 'Missão'}
        </span>
        <span style={{ color: 'var(--ink4)', fontSize: 10 }}>›</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{missionPlan.name || 'Nova missão'}</span>
        <span style={{
          ...mono, fontSize: 7, letterSpacing: '.08em', textTransform: 'uppercase',
          padding: '1px 6px', borderRadius: 2, marginLeft: 4,
          background: hwLink.connected ? 'rgba(58,144,96,.12)' : 'rgba(26,24,20,.06)',
          color: hwLink.connected ? 'var(--ok2)' : 'var(--ink4)',
        }}>{hwLink.connected ? 'hardware real' : 'simulação'}</span>
        <div style={{ flex: 1 }} />
        <ViewToggle />
        {missionPlan.frameworkId && (
          <button onClick={exitFramework} style={{
            padding: '3px 10px', borderRadius: 4, cursor: 'pointer',
            border: '1px solid var(--rule)', background: 'var(--paper)',
            ...mono, fontSize: 8, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink3)',
          }}>Trocar missão</button>
        )}
      </div>

      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <HardwareViews showToggle={false} />

        {empty && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -40%)',
            textAlign: 'center', pointerEvents: 'none',
          }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink3)', marginBottom: 4 }}>Placa vazia</div>
            <div style={{ ...mono, fontSize: 9, color: 'var(--ink4)' }}>
              {missionPlan.frameworkId ? 'adicione componentes no painel ao lado' : 'escolha a competição para começar'}
            </div>
          </div>
        )}
      </div>

      {/* live economics + honest wiring statusline */}
      <div style={{
        height: 24, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px',
        background: 'var(--paper3)', borderTop: '1px solid var(--rule)',
        ...mono, fontSize: 8, color: 'var(--ink4)',
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
export default function MissionSection() {
  const { missionPlan, entities, live, loadMissionDraft, setSection, markFirstStageConfirmed, notify } = useForge()
  const fw = getFramework(missionPlan.frameworkId)
  const resolved = resolveObjective(missionPlan)
  const eco = live?.eco || { massG: 0, priceBRL: 0 }
  const sensors = Object.keys(entities).filter(id => id !== 'esp32')
  const wiredAll = Object.keys(entities).length > 0 &&
    Object.keys(entities).every(id => live?.wiring?.[id]?.wired)

  // stage completion drives the flow: the first incomplete stage opens
  // automatically; users can reopen any stage manually.
  const stages = [
    {
      id: 'comp', title: 'Competição', done: !!missionPlan.frameworkId,
      summary: fw ? `${fw.name}${fw.payload?.massMaxG ? ` · ${fw.payload.massMaxG} g` : ''}` : null,
      el: <CompetitionStage />,
      enabled: true,
    },
    {
      id: 'obj', title: 'Objetivo científico', done: !!missionPlan.objectiveId,
      summary: resolved ? `${resolved.label} · ${resolved.meta.rateHz || '—'} · ${resolved.meta.altitude || 'altitude —'}` : null,
      el: <ObjectiveStage />,
      enabled: !!missionPlan.frameworkId,
    },
    {
      id: 'det', title: 'Missão & restrições', done: missionPlan.name.trim().length >= 2,
      summary: missionPlan.name
        ? `${missionPlan.name}${missionPlan.budgetBRL ? ` · orçamento R$ ${missionPlan.budgetBRL}` : ' · sem orçamento definido'}`
        : null,
      el: <DetailsStage />,
      enabled: !!missionPlan.objectiveId,
    },
    {
      id: 'hw', title: 'Hardware', done: Object.keys(entities).length >= 2,
      summary: Object.keys(entities).length
        ? `${Object.keys(entities).length} módulos · ${eco.massG} g · R$ ${eco.priceBRL}`
        : null,
      el: <HardwareStage />,
      enabled: !!missionPlan.objectiveId,
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
  const [confirmed, setConfirmed] = useState({})
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

  // Draft restore banner — read once; never auto-restores.
  const [draft, setDraft] = useState(() => {
    try { return JSON.parse(localStorage.getItem('forge_mission_draft')) } catch { return null }
  })
  const restoreDraft = () => {
    loadMissionDraft(draft)
    const p = draft.missionPlan || {}
    const conf = {}
    if (p.frameworkId) conf.comp = true
    if (p.objectiveId) conf.obj = true
    if ((p.name || '').trim().length >= 2) conf.det = true
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
              <div style={{ fontSize: 11, color: 'var(--ink2)', lineHeight: 1.4, marginBottom: 6 }}>
                Rascunho salvo em {new Date(draft.savedAt).toLocaleString('pt-BR')} — deseja restaurar?
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={restoreDraft} style={{
                  padding: '4px 12px', borderRadius: 4, border: 'none', cursor: 'pointer',
                  background: 'var(--navy)', color: 'rgba(255,255,255,.9)', fontSize: 10.5,
                  fontFamily: "'Space Grotesk', sans-serif",
                }}>Restaurar</button>
                <button onClick={discardDraft} style={{
                  padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
                  border: '1px solid var(--rule)', background: 'transparent', color: 'var(--ink3)', fontSize: 10.5,
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
              onEdit={() => notify('Edição de missão salva · em breve')}>
              {s.el}
            </Stage>
          ))}
        </div>
        <ProgressFooter />
        {stages.length > 0 && stages[stages.length - 1].id === 'wire' && stages[stages.length - 1].done && (
          <div style={{ padding: '10px 14px', borderTop: '1px solid var(--rule)', flexShrink: 0, background: 'var(--paper2)' }}>
            <button onClick={() => setSection('architecture')} style={{
              width: '100%', padding: '8px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: 'var(--navy)', color: 'rgba(255,255,255,.9)', fontSize: 12,
              fontFamily: "'Space Grotesk', sans-serif",
            }}>Ver arquitetura</button>
          </div>
        )}
      </div>

      {/* live hardware view */}
      <BuilderCanvas />
    </div>
  )
}
