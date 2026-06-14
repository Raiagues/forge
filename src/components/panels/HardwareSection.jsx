import { useState } from 'react'
import useForge, { COMPONENT_DEFS } from '../../store/useForge'
import {
  getFramework, resolveObjective, SOURCE_LABEL, effectiveProps, budgetDelta, OBSAT_FORMAT_LIST,
} from '../../mission/index.js'
import HardwareViews, { BigViewToggle } from '../canvas/HardwareViews'
import CatGlyph from '../ui/catGlyphs'
import BudgetMeters from '../ui/BudgetMeters'
import { usePanelWidth } from '../ui/usePanelWidth'
import { PanelDivider } from '../ui/Resizable'

// ──────────────────────────────────────────────────────────────────
// Hardware window — PHYSICAL LAYOUT (Part 8 of the redesign).
//
// The mission (what + why) is defined ONCE by the consultant (Part 2) and
// the user arrives here with a pre-populated component list. This screen's
// job is layout: place components on the board, route traces, and view in
// 2D or 3D. The default view is the 2D schematic; the 2D/3D switch is a
// large, labeled control at the center-top (KiCad-style).
//
// Mission editing here is SCOPED to hardware-relevant parameters only —
// satellite format, budget, and the component manifest — not the whole
// mission flow (that lives in the Mission window).
// ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: "'Space Mono', monospace" }
const SEV_COLOR = { error: 'var(--err2)', warn: 'var(--warn2)', info: 'var(--ink3)' }
const sectionTitle = { ...mono, fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink4)', margin: '0 0 8px' }

// ── scoped mission controls (format + budget) ──────────────────────
function ScopedMission() {
  const { missionPlan, setFormat, setBudget, setSection } = useForge()
  const active = missionPlan.format || 'cubesat'
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={sectionTitle}>Missão</span>
        <span style={{ flex: 1 }} />
        <button onClick={() => setSection('mission')} style={{ ...mono, fontSize: 11, color: 'var(--acc)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>editar definição →</button>
      </div>
      <div style={{ ...mono, fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 5 }}>formato</div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {OBSAT_FORMAT_LIST.map(f => {
          const sel = active === f.id
          return (
            <button key={f.id} onClick={() => setFormat(f.id)} title={`${f.label} · ${f.sizeNote} · ≤ ${f.massMaxG} g`}
              style={{ flex: 1, padding: '5px 2px', borderRadius: 4, cursor: 'pointer',
                border: `1px solid ${sel ? 'var(--acc)' : 'var(--rule)'}`, background: sel ? 'rgba(158,74,44,.08)' : 'var(--paper)',
                ...mono, fontSize: 9.5, letterSpacing: '.04em', textTransform: 'uppercase', color: sel ? 'var(--acc)' : 'var(--ink4)' }}>
              {f.id === 'pocketqube' ? 'Pocket' : f.label.replace(' 1U', '')}
            </button>
          )
        })}
      </div>
      <label style={{ ...mono, fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink4)' }}>orçamento (R$)
        <input type="number" value={missionPlan.budgetBRL ?? ''} onChange={e => setBudget(e.target.value)} placeholder="opcional"
          style={{ width: '100%', marginTop: 4, padding: '6px 9px', borderRadius: 'var(--r-md)', border: '1px solid var(--rule)', background: 'var(--paper)', fontSize: 13.5, color: 'var(--ink)', fontFamily: "'Space Grotesk', sans-serif" }} />
      </label>
    </div>
  )
}

// ── component manifest (add/remove · the pre-populated list) ────────
const CAT_LABELS = { mcu: 'Processamento', sensor: 'Sensores', comm: 'Comunicação', storage: 'Armazenamento', power: 'Energia' }
const CAT_ORDER = ['mcu', 'sensor', 'comm', 'storage', 'power']

function ComponentManifest({ onHover }) {
  const { entities, missionPlan, toggleHardware, selectEntity } = useForge()
  const groups = {}
  Object.values(COMPONENT_DEFS).forEach(d => { (groups[d.category] ||= []).push(d) })
  return (
    <div style={{ marginBottom: 16 }}>
      <span style={sectionTitle}>Componentes</span>
      {CAT_ORDER.filter(c => groups[c]).map(cat => (
        <div key={cat} style={{ marginBottom: 10 }}>
          <div style={{ ...mono, fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 5 }}>{CAT_LABELS[cat]}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {groups[cat].sort((a, b) => (a.comingSoon ? 1 : 0) - (b.comingSoon ? 1 : 0)).map(d => {
              const placed = !!entities[d.id]
              const eff = effectiveProps(d, missionPlan.overrides[d.id])
              const soon = !!d.comingSoon
              return (
                <button key={d.id}
                  onClick={(e) => toggleHardware(d.id, e.currentTarget)}
                  onDoubleClick={() => placed && selectEntity(d.id)}
                  onMouseEnter={() => onHover?.(!placed && !soon ? d.id : null)}
                  onMouseLeave={() => onHover?.(null)}
                  title={soon ? d.label : placed ? `${d.label} · remover · duplo clique inspeciona` : `${d.label} · adicionar`}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', width: '100%',
                    padding: '8px 10px', borderRadius: 'var(--r-md)', cursor: 'pointer',
                    border: `1px solid ${placed ? 'var(--ok2)' : 'var(--rule)'}`,
                    background: placed ? 'rgba(58,144,96,.07)' : 'var(--paper)', opacity: soon ? 0.55 : 1, transition: 'all .15s' }}>
                  <CatGlyph cat={cat} size={22} color={placed ? 'var(--ok2)' : 'var(--ink3)'} />
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
    </div>
  )
}

// ── wiring summary (drives the 2D editor) ──────────────────────────
function WiringStage() {
  const { entities, live, setHardwareView, autoWire } = useForge()
  const sensors = Object.keys(entities).filter(id => id !== 'esp32')
  return (
    <div style={{ marginBottom: 16 }}>
      <span style={sectionTitle}>Fiação</span>
      {sensors.length === 0 && <div style={{ fontSize: 13, color: 'var(--ink4)', marginBottom: 6 }}>Adicione sensores para conectar.</div>}
      {sensors.map(id => {
        const st = live?.wiring?.[id]
        return (
          <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 9px', borderRadius: 5, marginBottom: 4, border: '1px solid var(--rule)', background: 'var(--paper)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: st?.wired ? 'var(--ok2)' : 'var(--ink4)' }} />
            <span style={{ flex: 1, fontSize: 13.5, color: 'var(--ink)' }}>{entities[id].def.label}</span>
            {st?.wired
              ? <span style={{ ...mono, fontSize: 11, color: 'var(--ok2)' }}>conectado</span>
              : <button onClick={() => autoWire(id)} style={{ ...mono, fontSize: 11, color: 'var(--acc)', cursor: 'pointer', border: '1px solid var(--rule)', background: 'var(--paper2)', borderRadius: 3, padding: '2px 7px' }}>auto-conectar</button>}
          </div>
        )
      })}
      {sensors.length > 0 && (
        <button onClick={() => setHardwareView('2d')} style={{ width: '100%', padding: '7px 10px', borderRadius: 5, marginTop: 4, cursor: 'pointer', border: 'none', background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontSize: 13.5, fontFamily: "'Space Grotesk', sans-serif" }}>Abrir editor de fiação 2D →</button>
      )}
    </div>
  )
}

// ── live validation notices (compact, source-tagged) ───────────────
function ValidationNotices() {
  const { live, toggleHardware, entities } = useForge()
  const validation = live?.validation
  const shown = (validation?.issues || []).filter(i => i.severity !== 'info').slice(0, 4)
  if (!shown.length) return null
  return (
    <div style={{ marginBottom: 16 }}>
      <span style={sectionTitle}>Validação ao vivo</span>
      {shown.map((iss, i) => (
        <div key={i} style={{ border: '1px solid var(--rule)', background: iss.severity === 'error' ? 'rgba(184,75,44,.06)' : 'rgba(200,131,26,.06)', borderRadius: 'var(--r-md)', padding: '7px 10px', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: SEV_COLOR[iss.severity] }} />
            <span style={{ ...mono, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink4)', flexShrink: 0 }}>{SOURCE_LABEL[iss.source] || iss.source}</span>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{iss.title}</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.45 }}>{iss.detail}</div>
          {iss.suggestions?.filter(s => !entities[s.id]).slice(0, 2).map(s => (
            <button key={s.id} onClick={() => toggleHardware(s.id)} style={{ fontSize: 13, cursor: 'pointer', padding: '3px 8px', borderRadius: 4, marginTop: 5, marginRight: 5, border: '1px solid var(--rule)', background: 'var(--paper)', color: 'var(--ink2)', fontFamily: "'Space Grotesk', sans-serif" }}>+ {COMPONENT_DEFS[s.id]?.friendly || s.label}</button>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── canvas area (always live, big center-top 2D/3D switch) ──────────
function BuilderCanvas() {
  const { entities, missionPlan, live, hwLink } = useForge()
  const empty = Object.keys(entities).length === 0
  const eco = live?.eco || { massG: 0, priceBRL: 0, currentmA: 0 }
  const v = live?.validation
  const wired = Object.keys(entities).filter(id => live?.wiring?.[id]?.wired).length

  return (
    <div style={{ flex: 1, position: 'relative', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      {/* breadcrumb + large center-top view toggle */}
      <div style={{ height: 48, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', background: 'var(--paper2)', borderBottom: '1px solid var(--rule)' }}>
        <span style={{ ...mono, fontSize: 12, letterSpacing: '.08em', color: 'var(--ink3)' }}>{missionPlan.frameworkId ? getFramework(missionPlan.frameworkId)?.name : 'Missão'}</span>
        {missionPlan.name?.trim() && (<><span style={{ color: 'var(--ink4)', fontSize: 13 }}>›</span><span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{missionPlan.name}</span></>)}
        <span style={{ flex: 1 }} />
        <BigViewToggle />
        <span style={{ flex: 1 }} />
        <span style={{ ...mono, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', padding: '1px 6px', borderRadius: 2, background: hwLink.connected ? 'rgba(58,144,96,.12)' : 'rgba(26,24,20,.06)', color: hwLink.connected ? 'var(--ok2)' : 'var(--ink4)' }}>{hwLink.connected ? 'hardware real' : 'simulação'}</span>
      </div>

      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <HardwareViews showToggle={false} />
        {empty && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -40%)', textAlign: 'center', pointerEvents: 'none', background: 'var(--paper2)', border: '1px solid var(--rule)', borderRadius: 8, padding: '14px 22px' }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink3)', marginBottom: 4 }}>Placa vazia</div>
            <div style={{ ...mono, fontSize: 12, color: 'var(--ink4)' }}>adicione componentes no painel ao lado</div>
          </div>
        )}
      </div>

      {/* live economics + honest wiring statusline */}
      <div style={{ height: 24, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px', background: 'var(--paper3)', borderTop: '1px solid var(--rule)', ...mono, fontSize: 11, color: 'var(--ink4)' }}>
        {v && (
          <>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: v.summary.errors ? 'var(--err2)' : 'var(--ok2)' }} />
              {v.summary.errors ? `${v.summary.errors} erro${v.summary.errors > 1 ? 's' : ''}` : 'requisitos ok'}
            </span>
            {v.summary.warnings > 0 && <span style={{ color: 'var(--warn2)' }}>{v.summary.warnings} aviso{v.summary.warnings > 1 ? 's' : ''}</span>}
          </>
        )}
        {Object.keys(entities).length > 0 && <span>{wired}/{Object.keys(entities).length} conectados</span>}
        <div style={{ flex: 1 }} />
        <span>{eco.massG} g</span><span>·</span><span>{eco.currentmA.toFixed(0)} mA</span><span>·</span>
        <span style={{ color: missionPlan.budgetBRL && eco.priceBRL > missionPlan.budgetBRL ? 'var(--err2)' : 'var(--ink4)' }}>R$ {eco.priceBRL}{missionPlan.budgetBRL ? ` / ${missionPlan.budgetBRL}` : ''}</span>
      </div>
    </div>
  )
}

// ── main section ──────────────────────────────────────────────────
export default function HardwareSection() {
  const { entities, live, missionPlan, openPhaseReview } = useForge()
  const [cfgW, setCfgW] = usePanelWidth('forge.hwBuilderW', 308, 232, 540)
  const [hoverComp, setHoverComp] = useState(null)
  const hoverDelta = hoverComp && !entities[hoverComp] ? budgetDelta({ defs: COMPONENT_DEFS, compId: hoverComp, overrides: missionPlan.overrides }) : null
  const sensors = Object.keys(entities).filter(id => id !== 'esp32')
  const wiredAll = Object.keys(entities).length > 0 && Object.keys(entities).every(id => live?.wiring?.[id]?.wired)
  const ready = Object.keys(entities).length >= 2 && (sensors.length === 0 || wiredAll)
  const obj = resolveObjective(missionPlan)

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden', display: 'flex' }}>
      <div style={{ width: cfgW, flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'var(--paper2)', borderRight: '1px solid var(--rule)' }}>
        <div style={{ padding: '14px 14px 4px', flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', fontFamily: "'Space Grotesk', sans-serif" }}>{missionPlan.name?.trim() || 'Integração de hardware'}</div>
          {obj && <div style={{ ...mono, fontSize: 11, color: 'var(--ink4)', marginTop: 2 }}>{obj.label}</div>}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
          <ScopedMission />
          <ComponentManifest onHover={setHoverComp} />
          <WiringStage />
          <ValidationNotices />
        </div>
        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--rule)', flexShrink: 0, background: 'var(--paper2)' }}>
          <div style={{ ...mono, fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 8 }}>orçamentos</div>
          <BudgetMeters delta={hoverDelta} showFormat={false} />
        </div>
        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--rule)', flexShrink: 0, background: 'var(--paper2)' }}>
          <button onClick={() => openPhaseReview('hardware')} disabled={!ready}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: 'none', cursor: ready ? 'pointer' : 'not-allowed',
              background: ready ? 'var(--btn-bg)' : 'var(--paper4)', color: ready ? 'var(--btn-fg)' : 'var(--ink4)', fontSize: 14, fontFamily: "'Space Grotesk', sans-serif" }}>
            Revisar e avançar →
          </button>
          {!ready && <div style={{ ...mono, fontSize: 11, color: 'var(--ink4)', marginTop: 5 }}>coloque os componentes e conecte os sensores</div>}
        </div>
      </div>

      <PanelDivider w={cfgW} setW={setCfgW} side="right" />
      <BuilderCanvas />
    </div>
  )
}
