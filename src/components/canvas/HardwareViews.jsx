import { Suspense, useMemo, useState } from 'react'
import useForge from '../../store/useForge'
import ForgeCanvas from './ForgeCanvas'
import SchematicView from './SchematicView'
import BreadboardView from './BreadboardView'
import { runDRC, optimizeLayout, getFabRule, FAB_RULES, computeTips } from '../../mission/index.js'
import { routeTraces, routeMetrics } from '../../mission/autorouter.js'
import { footprint } from './pinLayout.js'
import { track } from '../../lib/analytics.js'

const drcSizeOf = (e) => { const s = footprint(e.id, e.def).size; return { w: s[0], d: s[2] } }

// ──────────────────────────────────────────────────────────────────
// HardwareViews — 3D spatial board ↔ 2D schematic, same hardware
// graph and state underneath. The toggle persists in the store so the
// choice carries across sections (Mission center, Hardware, Debug).
// ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: "'Space Mono', monospace" }

// 3D interaction modes (see store.canvasMode for the design rationale):
// editar = direct manipulation (drag chip moves it, drag background
// orbits) · navegar = camera only, no accidental edits · rotear =
// click a pin then a destination pin to lay a copper trace.
const MODES = [
  { id: 'navigate', label: 'navegar',  hint: 'arrastar orbita a câmera · clique seleciona' },
  { id: 'edit',     label: 'editar',   hint: 'arraste um chip para movê-lo · fundo orbita' },
  { id: 'route',    label: 'rotear',   hint: 'clique em um pino e depois no destino · Esc cancela · Delete remove a trilha' },
]

export function ModeToggle({ style }) {
  const { canvasMode, setCanvasMode, notify } = useForge()
  return (
    <div style={{ display: 'flex', gap: 0, border: '1px solid var(--rule)', borderRadius: 4, overflow: 'hidden', ...style }}>
      {MODES.map(m => (
        <button key={m.id} title={m.hint}
          onClick={() => { setCanvasMode(m.id); notify(`modo ${m.label}: ${m.hint}`) }}
          style={{
            padding: '3px 11px', border: 'none', cursor: 'pointer',
            ...mono, fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase',
            background: canvasMode === m.id ? 'var(--btn-bg)' : 'var(--paper2)',
            color: canvasMode === m.id ? 'rgba(255,255,255,.85)' : 'var(--ink3)',
          }}>{m.label}</button>
      ))}
    </div>
  )
}

const VIEW_LABELS = { '3d': '3D placa', '2d': '2D esquema', breadboard: 'protoboard' }
export function ViewToggle({ style }) {
  const { hardwareView, setHardwareView } = useForge()
  return (
    <div style={{ display: 'flex', gap: 0, border: '1px solid var(--rule)', borderRadius: 4, overflow: 'hidden', ...style }}>
      {['3d', '2d', 'breadboard'].map(v => (
        <button key={v} onClick={() => setHardwareView(v)} style={{
          padding: '3px 11px', border: 'none', cursor: 'pointer',
          ...mono, fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase',
          background: hardwareView === v ? 'var(--btn-bg)' : 'var(--paper2)',
          color: hardwareView === v ? 'rgba(255,255,255,.85)' : 'var(--ink3)',
        }}>{VIEW_LABELS[v]}</button>
      ))}
    </div>
  )
}

// Large, labeled 2D/3D switch for the center-top of the Hardware screen
// (Part 8) — researched against KiCad's prominent view switching. The
// breadboard view stays available from the small ViewToggle elsewhere.
const BIG_VIEWS = [
  { id: '2d', label: '2D · Esquema', hint: 'ligar pinos e ver a fiação' },
  { id: '3d', label: '3D · Placa', hint: 'posicionar componentes na PCB' },
]
export function BigViewToggle() {
  const { hardwareView, setHardwareView } = useForge()
  return (
    <div style={{ display: 'flex', gap: 6, padding: 4, borderRadius: 9, background: 'var(--paper3)', border: '1px solid var(--rule)' }}>
      {BIG_VIEWS.map(v => {
        const active = hardwareView === v.id
        return (
          <button key={v.id} onClick={() => setHardwareView(v.id)} title={v.hint}
            style={{
              padding: '7px 18px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, fontWeight: active ? 700 : 500,
              background: active ? 'var(--btn-bg)' : 'transparent',
              color: active ? 'var(--btn-fg)' : 'var(--ink3)', transition: 'all .15s',
            }}>{v.label}</button>
        )
      })}
    </div>
  )
}

// ── board + DRC control panel (3D view) ────────────────────────────
// Fabrication target, board dimensions, trace width and the live
// design-rule check, with one-click auto-optimize. Collapsible so it
// stays out of the way; the dot mirrors the worst DRC severity.
function BoardPanel() {
  const { entities, wires, board, setBoardDim, setFabRule, applyPositions, setWireVia, notify } = useForge()
  const [open, setOpen] = useState(false)
  const rule = getFabRule(board.ruleId)
  const drc = useMemo(
    () => runDRC({ entities, board, rule, sizeOf: drcSizeOf }),
    [entities, board, rule],
  )
  const dot = drc.errors ? 'var(--err2)' : drc.warnings ? 'var(--warn2)' : 'var(--ok2)'
  const hasParts = Object.keys(entities).length > 0
  const hasWires = wires.length > 0

  const optimize = () => {
    track('drc_optimize', { target: String(drc.violations.length) })
    applyPositions(optimizeLayout({ entities, wires, board, sizeOf: drcSizeOf }))
  }

  // world XZ of a pin (mirrors ForgeCanvas.pinWorldXZ) for the router
  const pinXZ = (end) => {
    const e = entities[end.comp]; if (!e) return null
    const p = footprint(e.id, e.def).pins[end.pin]; if (!p) return null
    const a = e.rotation?.[1] || 0, cos = Math.cos(a), sin = Math.sin(a)
    return [e.position[0] + p.x * cos + p.z * sin, e.position[2] - p.x * sin + p.z * cos]
  }
  // autorouter pass: pick each trace's bend to minimize crossings+length,
  // then apply the result as each wire's `via` (Prompt A Part 5).
  const autoRoute = () => {
    const idxs = [], endpoints = []
    wires.forEach((w, i) => { const a = pinXZ(w.from), b = pinXZ(w.to); if (a && b) { idxs.push(i); endpoints.push({ a, b }) } })
    if (!endpoints.length) return
    const naive = routeMetrics(endpoints.map(e => ({ route: [e.a, e.b] })))
    const res = routeTraces(endpoints)
    res.forEach((r, k) => setWireVia(idxs[k], r.via))
    const after = routeMetrics(res)
    track('autoroute', { target: `${naive.crossings}->${after.crossings}` })
    notify(`auto-roteado · ${after.crossings} cruzamento(s) · ${res.length} trilha(s)`)
  }

  const numField = (label, field, step = 1) => (
    <label style={{ ...mono, fontSize: 10.5, color: 'var(--ink4)', display: 'flex', flexDirection: 'column', gap: 3 }}>
      {label}
      <input type="number" min={field === 'traceWidthMm' ? 0.05 : 5} step={step} value={board[field]}
        onChange={(e) => setBoardDim(field, e.target.value === '' ? '' : Number(e.target.value))}
        style={{ width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid var(--rule)', background: 'var(--paper)', ...mono, fontSize: 12, color: 'var(--ink)' }} />
    </label>
  )

  return (
    <div style={{
      position: 'absolute', bottom: 10, left: 10, zIndex: 12, width: open ? 244 : 'auto',
      background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 7,
      boxShadow: '0 4px 14px rgba(14,30,51,.12)', overflow: 'hidden',
    }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 7, width: '100%', cursor: 'pointer',
        padding: '7px 10px', border: 'none', background: 'var(--paper2)',
        ...mono, fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink3)',
      }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot }} />
        Placa · DRC
        {hasParts && (drc.errors || drc.warnings) ? (
          <span style={{ color: dot }}>{drc.errors ? `${drc.errors}E` : ''}{drc.errors && drc.warnings ? ' ' : ''}{drc.warnings ? `${drc.warnings}A` : ''}</span>
        ) : hasParts ? <span style={{ color: 'var(--ok2)' }}>ok</span> : null}
        <span style={{ marginLeft: 'auto' }}>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div style={{ padding: '10px 10px 11px', display: 'flex', flexDirection: 'column', gap: 9 }}>
          <label style={{ ...mono, fontSize: 10.5, color: 'var(--ink4)', display: 'flex', flexDirection: 'column', gap: 3 }}>
            alvo de fabricação
            <select value={board.ruleId} onChange={(e) => setFabRule(e.target.value)}
              style={{ width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid var(--rule)', background: 'var(--paper)', ...mono, fontSize: 12, color: 'var(--ink)' }}>
              {FAB_RULES.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <div style={{ ...mono, fontSize: 10, color: 'var(--ink4)', lineHeight: 1.4 }}>
            trilha mín {rule.minTraceMm} mm · isol {rule.minClearanceMm} mm · furo {rule.minDrillMm} mm · {rule.material}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
            {numField('largura (mm)', 'widthMm')}
            {numField('altura (mm)', 'heightMm')}
          </div>
          {numField('largura da trilha (mm)', 'traceWidthMm', 0.05)}

          <div style={{ borderTop: '1px solid var(--rule2)', paddingTop: 8 }}>
            {!hasParts ? (
              <div style={{ ...mono, fontSize: 11, color: 'var(--ink4)' }}>adicione componentes para checar</div>
            ) : drc.violations.length === 0 ? (
              <div style={{ ...mono, fontSize: 11.5, color: 'var(--ok2)' }}>✓ sem violações de regra</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 130, overflowY: 'auto' }}>
                {drc.violations.map(v => (
                  <div key={v.id} style={{ display: 'flex', gap: 6, ...mono, fontSize: 11, lineHeight: 1.4, color: 'var(--ink3)' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginTop: 4, background: v.severity === 'error' ? 'var(--err2)' : 'var(--warn2)' }} />
                    <span>{v.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {hasParts && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button onClick={optimize} style={{
                width: '100%', padding: '7px 10px', borderRadius: 5, border: 'none', cursor: 'pointer',
                background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontSize: 13, fontFamily: "'Space Grotesk', sans-serif",
              }}>otimizar layout</button>
              <button onClick={autoRoute} disabled={!hasWires}
                title={hasWires ? 'reroteia as trilhas minimizando cruzamentos e comprimento' : 'faça a fiação primeiro'}
                style={{
                  width: '100%', padding: '7px 10px', borderRadius: 5, cursor: hasWires ? 'pointer' : 'not-allowed',
                  border: '1px solid var(--btn-bg)', background: 'transparent',
                  color: hasWires ? 'var(--ink)' : 'var(--ink4)', fontSize: 13, fontFamily: "'Space Grotesk', sans-serif",
                }}>auto-rotear trilhas</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── contextual tips (non-blocking) ─────────────────────────────────
// Gentle nudges derived from the live build state; each carries a
// "Saiba mais" into the AI tutor. Dismissible, never interrupts.
function TipBanner() {
  const { entities, wires, live, dismissedTips, dismissTip, askAssistant } = useForge()
  const tips = useMemo(
    () => computeTips({ entities, wires, wiring: live?.wiring || {} }),
    [entities, wires, live],
  ).filter(t => !dismissedTips.includes(t.id)).slice(0, 2)
  if (!tips.length) return null
  return (
    <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 12, width: 'min(460px, calc(100% - 40px))', display: 'flex', flexDirection: 'column', gap: 7 }}>
      {tips.map(t => (
        <div key={t.id} style={{
          display: 'flex', alignItems: 'flex-start', gap: 9, padding: '9px 11px',
          background: 'var(--paper)', border: '1px solid var(--rule)', borderLeft: '3px solid var(--warn2)',
          borderRadius: 7, boxShadow: '0 4px 14px rgba(14,30,51,.12)',
        }}>
          <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>💡</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.45 }}>{t.message}</div>
            <button onClick={() => { track('tip_learn_more', { target: t.id }); askAssistant(t.question) }} style={{
              marginTop: 6, padding: '3px 9px', borderRadius: 4, cursor: 'pointer', border: '1px solid var(--acc)',
              background: 'transparent', color: 'var(--acc)', ...mono, fontSize: 11,
            }}>Saiba mais →</button>
          </div>
          <button onClick={() => dismissTip(t.id)} title="Dispensar" style={{
            flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink4)', fontSize: 15, lineHeight: 1, padding: 2,
          }}>×</button>
        </div>
      ))}
    </div>
  )
}

export default function HardwareViews({ showToggle = true }) {
  const hardwareView = useForge(s => s.hardwareView)
  return (
    <div style={{ height: '100%', position: 'relative' }}>
      {hardwareView === '2d' ? (
        <SchematicView />
      ) : hardwareView === 'breadboard' ? (
        <BreadboardView />
      ) : (
        <Suspense fallback={
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ ...mono, fontSize: 13, color: 'var(--ink4)', letterSpacing: '.1em' }}>carregando cena 3D…</span>
          </div>
        }>
          <ForgeCanvas />
        </Suspense>
      )}
      {hardwareView === '3d' && <BoardPanel />}
      <TipBanner />
      {showToggle && (
        <div style={{ position: 'absolute', top: 8, right: 10, zIndex: 12, display: 'flex', gap: 8 }}>
          {hardwareView === '3d' && <ModeToggle />}
          <ViewToggle />
        </div>
      )}
    </div>
  )
}
