import { useEffect, useState } from 'react'
import { api } from '../../lib/api.js'
import { fromSharePayload } from '../../mission/summary.js'
import { COMPONENT_DEFS } from '../../store/useForge'

// ──────────────────────────────────────────────────────────────────
// MissionSummary — the public, read-only shareable mission page
// (IMPLEMENTATION_PLAN §4 item 14). Rendered standalone (no workspace
// chrome) when the URL carries ?share=<token>. Fetches the sanitized
// snapshot from the backend and renders the mission overview, hardware,
// schedule and filed phase reports. No auth, no editing.
// ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: "'Space Mono', monospace" }
const slab = { fontFamily: "'Zilla Slab', 'Space Grotesk', serif" }
const CREAM = '#F4EFE6'
const GOLD = '#C9A227'

export default function MissionSummary({ token }) {
  const [state, setState] = useState({ loading: true, error: null, data: null })

  useEffect(() => {
    let alive = true
    api.share(token).then(res => {
      if (!alive) return
      if (res.ok) setState({ loading: false, error: null, data: fromSharePayload(res.summary, { defs: COMPONENT_DEFS }) })
      else setState({ loading: false, error: res.offline ? 'Servidor indisponível. Tente novamente quando o backend estiver no ar.' : (res.error || 'Resumo não encontrado.'), data: null })
    })
    return () => { alive = false }
  }, [token])

  return (
    <div style={{ minHeight: '100vh', background: '#10233F', color: CREAM, padding: '40px 20px', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <div style={{ ...mono, fontSize: 11, letterSpacing: '.22em', textTransform: 'uppercase', color: GOLD, marginBottom: 8 }}>GuiaSat · Resumo de missão</div>
        {state.loading && <p style={{ ...mono, fontSize: 13, opacity: .8 }}>Carregando…</p>}
        {state.error && <p style={{ ...mono, fontSize: 13, color: '#E8A0A0' }}>{state.error}</p>}
        {state.data && <Summary d={state.data} />}
        <div style={{ marginTop: 40, borderTop: '1px solid rgba(244,239,230,.18)', paddingTop: 14, ...mono, fontSize: 10.5, opacity: .6 }}>
          Página pública somente leitura · gerada pela plataforma GuiaSat
        </div>
      </div>
    </div>
  )
}

function Summary({ d }) {
  const m = d.mission || {}
  const confirmed = (d.phases || []).filter(p => p.confirmed).length
  return (
    <>
      <h1 style={{ ...slab, fontSize: 40, fontWeight: 700, margin: '0 0 4px', color: CREAM, lineHeight: 1.05 }}>{d.project?.name || m.name}</h1>
      {(d.team?.name || d.team?.institution) && (
        <div style={{ ...mono, fontSize: 13, color: 'rgba(244,239,230,.8)', marginBottom: 24 }}>{[d.team?.name, d.team?.institution].filter(Boolean).join(' · ')}{d.project?.isDemo ? ' · demonstração' : ''}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 12, marginBottom: 28 }}>
        <Card label="Fases concluídas" value={`${confirmed}/${(d.phases || []).length}`} />
        {d.taskStats && <Card label="Tarefas" value={`${d.taskStats.done}/${d.taskStats.total}`} />}
        {m.framework && <Card label="Competição" value={String(m.framework).toUpperCase()} />}
        {m.budgetBRL != null && <Card label="Orçamento" value={`R$ ${m.budgetBRL}`} />}
      </div>

      <Section title="Objetivos">
        {Array.isArray(m.objectives) && m.objectives.length
          ? <ul style={{ ...mono, fontSize: 13, lineHeight: 1.7, margin: 0, paddingLeft: 18 }}>{m.objectives.map((o, i) => <li key={i}>{typeof o === 'string' ? o : (o.label || o.id)}</li>)}</ul>
          : <Empty />}
      </Section>

      <Section title={`Hardware (${(m.components || []).length})`}>
        {(m.components || []).length
          ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{m.components.map(c => (
              <span key={c.id} style={{ ...mono, fontSize: 12, border: `1px solid ${GOLD}`, color: CREAM, borderRadius: 5, padding: '5px 10px' }}>{c.label}<span style={{ opacity: .55 }}> · {c.part}</span></span>
            ))}</div>
          : <Empty />}
      </Section>

      <Section title="Linha do tempo de fases">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(d.phases || []).map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: p.confirmed ? GOLD : 'rgba(244,239,230,.3)', flexShrink: 0 }} />
              <span style={{ ...mono, fontSize: 13, color: p.confirmed ? CREAM : 'rgba(244,239,230,.55)' }}>{p.label}</span>
              {p.confirmedAt && <span style={{ ...mono, fontSize: 10.5, opacity: .6 }}>{new Date(p.confirmedAt).toLocaleDateString('pt-BR')}</span>}
            </div>
          ))}
        </div>
      </Section>

      {(d.reports || []).length > 0 && (
        <Section title="Relatórios de fase">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {d.reports.map((r, i) => (
              <div key={i} style={{ border: '1px solid rgba(244,239,230,.18)', borderRadius: 8, padding: 12 }}>
                <div style={{ ...mono, fontSize: 11, color: GOLD, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 5 }}>{r.phaseLabel}</div>
                <div style={{ ...mono, fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{r.summary || '—'}</div>
                {r.authorName && <div style={{ ...mono, fontSize: 10.5, opacity: .6, marginTop: 6 }}>{r.authorName}{r.confirmedAt ? ` · ${new Date(r.confirmedAt).toLocaleDateString('pt-BR')}` : ''}</div>}
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
  )
}

function Card({ label, value }) {
  return (
    <div style={{ border: '1px solid rgba(244,239,230,.2)', borderRadius: 8, padding: 14 }}>
      <div style={{ ...mono, fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(244,239,230,.6)', marginBottom: 6 }}>{label}</div>
      <div style={{ ...slab, fontSize: 26, fontWeight: 700, color: GOLD, lineHeight: 1 }}>{value}</div>
    </div>
  )
}
function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ ...mono, fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', color: GOLD, margin: '0 0 12px' }}>{title}</h2>
      {children}
    </div>
  )
}
const Empty = () => <span style={{ ...mono, fontSize: 12, opacity: .55 }}>—</span>
