import { useState, useCallback } from 'react'
import { SECTIONS, COMPONENT_DEFS } from '../../store/useForge'
import { getEvents, clearEvents, summarize, exportJSON, currentSession, resetSession } from '../../lib/analytics.js'
import { getFeatureInfo } from '../../lib/futureFeatures.js'

// ──────────────────────────────────────────────────────────────────
// AnalyticsPanel — developer-only behavioural view for user-testing
// sessions (gear icon). Reads the local event log (forge_analytics):
// what users click, where they spend time, what they add, and which
// future features they ask for most. No network involved.
// ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: "'Space Mono', monospace" }

const TYPE_LABEL = {
  nav_click: 'navegação entre seções',
  section_dwell: 'permanência em seção',
  panel_toggle: 'abrir/fechar inspetor',
  component_add: 'componente adicionado',
  component_remove: 'componente removido',
  coming_soon_click: 'clique em feature futura',
  stage_toggle: 'estágio da missão expandido/colapsado',
  analytics_open: 'abertura do analytics',
  wire: 'fios conectados',
  wire_invalid: 'fiações inválidas',
  wire_remove: 'fios removidos',
  wire_auto: 'auto-conexões',
  wire_clear: 'limpar fios',
  pin_select: 'pinos clicados',
  framework: 'competição escolhida',
  objective: 'objetivo escolhido',
  copilot: 'análises do copiloto',
  scan: 'scans I2C',
  module_open: 'módulos de firmware abertos',
  fw_edit: 'módulos de firmware editados',
  hw_view: 'troca de vista 2D/3D',
  hw_link: 'conexões de hardware real',
  template_load: 'perfis rápidos',
  generate_architecture: 'arquiteturas geradas',
}

const compLabel = (id) => COMPONENT_DEFS[id]?.friendly || COMPONENT_DEFS[id]?.label || id
const featureLabel = (id) => getFeatureInfo(id)?.title || compLabel(id)

function Card({ title, hint, children, wide }) {
  return (
    <div style={{
      border: '1px solid var(--rule)', borderRadius: 7, background: 'var(--paper2)',
      padding: '10px 12px', flex: wide ? '1 1 100%' : '1 1 300px', minWidth: 280,
    }}>
      <div style={{ ...mono, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 2 }}>{title}</div>
      {hint && <div style={{ fontSize: 13, color: 'var(--ink3)', marginBottom: 6 }}>{hint}</div>}
      {!hint && <div style={{ height: 5 }} />}
      {children}
    </div>
  )
}

function Row({ k, v, hot, rank }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '3px 0', borderBottom: '1px solid var(--rule2)' }}>
      <span style={{ fontSize: 13.5, color: 'var(--ink2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {rank != null && <span style={{ ...mono, fontSize: 12, color: 'var(--ink4)', marginRight: 6 }}>{String(rank).padStart(2, '0')}</span>}
        {k}
      </span>
      <span style={{ ...mono, fontSize: 13.5, color: hot ? 'var(--acc)' : 'var(--ink)', flexShrink: 0 }}>{v}</span>
    </div>
  )
}

const Empty = () => <div style={{ fontSize: 13.5, color: 'var(--ink4)' }}>sem dados ainda</div>

export default function AnalyticsPanel() {
  const sectionLabelOf = (id) => SECTIONS.find(s => s.id === id)?.label || id
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick(t => t + 1), [])
  void tick // forces a re-read of the event log

  const events = getEvents()
  const sum = summarize(events, { knownSections: SECTIONS.map(s => s.id) })

  const download = () => {
    const blob = new Blob([exportJSON()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `forge_analytics_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
  }
  const clear = () => {
    if (!window.confirm('Apagar todos os eventos registrados?')) return
    clearEvents(); refresh()
  }

  const btn = {
    padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
    border: '1px solid var(--rule)', background: 'var(--paper2)',
    ...mono, fontSize: 12, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink3)',
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '16px 22px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>Analytics da sessão</h2>
        <span style={{ ...mono, fontSize: 12, color: 'var(--ink4)' }}>
          local · {sum.total} eventos · {sum.sessions} sessã{sum.sessions === 1 ? 'o' : 'es'} · sessão atual {currentSession().slice(0, 8)}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={refresh} style={btn}>atualizar</button>
        <button onClick={download} style={btn}>exportar json</button>
        <button
          onClick={() => { if (window.confirm('Encerrar a sessão atual e iniciar uma nova? Os eventos são gravados em analytics/.')) resetSession() }}
          title="Grava os eventos pendentes, gera novo session id e recarrega o app"
          style={{ ...btn, color: 'var(--acc)' }}
        >nova sessão de teste</button>
        <button onClick={clear} style={{ ...btn, color: 'var(--err2)' }}>limpar dados</button>
      </div>
      <div style={{ ...mono, fontSize: 12, color: 'var(--ink4)', marginBottom: 16 }}>
        {sum.span ? `${sum.span.from.toLocaleString('pt-BR')} — ${sum.span.to.toLocaleString('pt-BR')}` : 'sem eventos ainda — interaja com a plataforma'}
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', maxWidth: 1100 }}>
        <Card title="Contagem de eventos por tipo">
          {sum.byType.length === 0 && <Empty />}
          {sum.byType.map(([type, n]) => <Row key={type} k={TYPE_LABEL[type] || type} v={n} />)}
        </Card>

        <Card title="Seções mais visitadas" hint="por tempo de permanência">
          {sum.dwell.length === 0 && <Empty />}
          {sum.dwell.map(([section, label]) => <Row key={section} k={sectionLabelOf(section)} v={label} hot />)}
          {sum.ignored.length > 0 && (
            <div style={{ marginTop: 8, paddingTop: 7, borderTop: '1px solid var(--rule)' }}>
              <div style={{ ...mono, fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--warn2)', marginBottom: 4 }}>nunca visitadas</div>
              <div style={{ ...mono, fontSize: 13, color: 'var(--ink3)' }}>{sum.ignored.map(sectionLabelOf).join(' · ')}</div>
            </div>
          )}
        </Card>

        <Card title="Componentes mais adicionados">
          {sum.topComponents.length === 0 && <Empty />}
          {sum.topComponents.map(([id, n], i) => <Row key={id} k={compLabel(id)} v={n} rank={i + 1} />)}
        </Card>

        <Card title="Features futuras mais pedidas" hint="ordem sugerida de implementação">
          {sum.topComingSoon.length === 0 && <Empty />}
          {sum.topComingSoon.map(([id, n], i) => <Row key={id} k={featureLabel(id)} v={n} rank={i + 1} hot />)}
        </Card>

        <Card title="Últimos eventos" wide>
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {events.length === 0 && <Empty />}
            {events.slice(-50).reverse().map((e, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '2px 0', borderBottom: '1px solid var(--rule2)', ...mono, fontSize: 12 }}>
                <span style={{ color: 'var(--ink4)', flexShrink: 0 }}>{new Date(e.timestamp).toLocaleTimeString('pt-BR')}</span>
                <span style={{ color: 'var(--acc)', flexShrink: 0, width: 150 }}>{e.eventName}</span>
                <span style={{ color: 'var(--ink2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {Object.entries(e.payload || {}).map(([k, v]) => `${k}=${v}`).join(' · ')}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
