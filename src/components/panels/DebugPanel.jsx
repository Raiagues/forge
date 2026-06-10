import { useMemo, useState } from 'react'
import useForge, { COMPONENT_DEFS } from '../../store/useForge'
import { DEBUG_GROUPS, DEBUG_TOOLS, toolsForGroup, runDebugTool } from '../../debug/index.js'
import EmptyState from './EmptyState'
import LogDoctorCard from './debug/LogDoctorCard'

// interactive tools declare `ui` in the registry; the panel maps it to a
// dedicated card component here (registry stays pure, panel stays thin)
const INTERACTIVE_UI = { logdoctor: LogDoctorCard }

// ──────────────────────────────────────────────────────────────────
// Debug — a modular diagnostics console. Each card is a pluggable tool
// from src/debug/registry.js, run against live store state. The panel is
// a thin renderer: it never knows what a tool does, only how to show its
// { status, summary, details } result. New tool families slot in via the
// registry (the "planned" groups below mark those extension points).
// ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: "'Space Mono', monospace" }
const TONE = { ok: 'var(--ok2)', warn: 'var(--warn2)', err: 'var(--err2)', idle: 'var(--ink4)' }
const TONE_BADGE = {
  ok: { background: 'rgba(42,107,74,.1)', color: 'var(--ok2)', border: 'rgba(42,107,74,.22)' },
  warn: { background: 'rgba(200,131,26,.1)', color: 'var(--warn2)', border: 'rgba(200,131,26,.25)' },
  err: { background: 'rgba(184,75,44,.1)', color: 'var(--err2)', border: 'rgba(184,75,44,.25)' },
  idle: { background: 'rgba(26,24,20,.05)', color: 'var(--ink4)', border: 'var(--rule)' },
}
const STATUS_WORD = { ok: 'ok', warn: 'aviso', err: 'erro', idle: 'inativo' }

export default function DebugPanel() {
  const entities = useForge((s) => s.entities)
  const live = useForge((s) => s.live)
  const missionPlan = useForge((s) => s.missionPlan)
  const [runKey, setRunKey] = useState(0)

  const ctx = { entities, defs: COMPONENT_DEFS, live, missionPlan }

  const results = useMemo(
    () => DEBUG_TOOLS.map((tool) => ({ tool, res: runDebugTool(tool, ctx) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entities, live, runKey],
  )

  if (Object.keys(entities).length === 0) return <EmptyState section="Debug" />

  const tally = results.reduce((a, { res }) => { a[res.status] = (a[res.status] || 0) + 1; return a }, {})
  // interactive tools (ui) render their own card; the grid keeps the rest
  const activeGroups = DEBUG_GROUPS.filter((g) => !g.planned && toolsForGroup(g.id).some((t) => !t.ui))
  const interactiveTools = DEBUG_TOOLS.filter((t) => t.ui && INTERACTIVE_UI[t.ui])
  const plannedGroups = DEBUG_GROUPS.filter((g) => g.planned)

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '16px 22px' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>Diagnóstico de hardware</h2>
          <span style={{ ...mono, fontSize: 9, color: 'var(--ink4)' }}>ferramentas modulares · estado real do projeto</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {['err', 'warn', 'ok'].map((k) => (tally[k] ? <Badge key={k} tone={k}>{tally[k]} {STATUS_WORD[k]}</Badge> : null))}
          <button onClick={() => setRunKey((n) => n + 1)} style={{
            padding: '5px 14px', borderRadius: 5, cursor: 'pointer', border: 'none',
            background: 'var(--navy)', color: 'rgba(255,255,255,.88)', fontSize: 11,
            fontFamily: "'Space Grotesk', sans-serif",
          }}>Rodar tudo</button>
        </div>
      </div>

      {/* debugging assistant — interactive tools get a full-width card */}
      {interactiveTools.map((tool) => {
        const Ui = INTERACTIVE_UI[tool.ui]
        return (
          <div key={tool.id} style={{ marginBottom: 14 }}>
            <Card title={DEBUG_GROUPS.find((g) => g.id === tool.group)?.label || tool.label} hint={tool.desc}>
              <div style={{ marginTop: 8 }}>
                <Ui />
              </div>
            </Card>
          </div>
        )
      })}

      {/* active tool groups */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
        {activeGroups.map((g) => (
          <Card key={g.id} title={g.label} hint={g.desc}>
            {toolsForGroup(g.id).filter((t) => !t.ui).map((tool) => {
              const { res } = results.find((r) => r.tool.id === tool.id)
              return <ToolBlock key={tool.id} tool={tool} res={res} />
            })}
          </Card>
        ))}
      </div>

      {/* planned extension points (architecture-only for now) */}
      <div style={{ marginTop: 16 }}>
        <div style={{ ...mono, fontSize: 8, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 8 }}>Ferramentas planejadas · pontos de extensão</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {plannedGroups.map((g) => (
            <span key={g.id} title={g.desc} style={{
              ...mono, fontSize: 9.5, padding: '5px 11px', borderRadius: 5,
              border: '1px dashed var(--rule)', background: 'var(--paper2)', color: 'var(--ink4)',
            }}>{g.label} · em breve</span>
          ))}
        </div>
        <div style={{ ...mono, fontSize: 8, color: 'var(--ink4)', marginTop: 8 }}>
          novas ferramentas registram em <span style={{ color: 'var(--ink3)' }}>src/debug/registry.js</span> (registerDebugTool) e aparecem aqui sozinhas
        </div>
      </div>
    </div>
  )
}

function ToolBlock({ tool, res }) {
  return (
    <div style={{ padding: '6px 0', borderTop: '1px solid var(--rule2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: TONE[res.status], flexShrink: 0 }} />
        <span style={{ fontSize: 11.5, color: 'var(--ink)', fontWeight: 500 }}>{tool.label}</span>
      </div>
      <div style={{ fontSize: 11, color: TONE[res.status] === TONE.idle ? 'var(--ink3)' : TONE[res.status], margin: '3px 0 4px 15px' }}>{res.summary}</div>
      <div style={{ marginLeft: 15 }}>
        {res.details.map((d, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '2px 0' }}>
            <span style={{ ...mono, fontSize: 9.5, color: 'var(--ink3)' }}>{d.label}</span>
            <span style={{ ...mono, fontSize: 9.5, color: d.tone ? TONE[d.tone] : 'var(--ink)' }}>{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Card({ title, hint, children }) {
  return (
    <div style={{ border: '1px solid var(--rule)', borderRadius: 7, background: 'var(--paper2)', padding: '10px 12px' }}>
      <div style={{ ...mono, fontSize: 8, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink4)' }}>{title}</div>
      {hint && <div style={{ fontSize: 10, color: 'var(--ink3)', marginTop: 2 }}>{hint}</div>}
      {children}
    </div>
  )
}

function Badge({ tone, children }) {
  const s = TONE_BADGE[tone]
  return <span style={{ ...mono, fontSize: 8, letterSpacing: '.06em', padding: '3px 8px', borderRadius: 3, border: `1px solid ${s.border}`, background: s.background, color: s.color }}>{children}</span>
}
