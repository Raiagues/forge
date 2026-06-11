import { useState } from 'react'
import useForge, { COMPONENT_DEFS } from '../../store/useForge'
import { SOFTWARE_LAYERS, activeModules } from '../../mission/index.js'
import EmptyState from './EmptyState'

// ──────────────────────────────────────────────────────────────────
// Architecture — software-only modular block diagram. Three columns by
// layer: Core Apps · Adaptive Apps · Mission Apps. Each card shows only
// its name and filename; clicking a card expands it inline to reveal the
// description. No hardware view, no side budget panel.
// ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: "'Space Mono', monospace" }

export default function ArchitecturePanel() {
  const { entities, missionPlan } = useForge()
  const [expanded, setExpanded] = useState({})
  const list = Object.values(entities)
  if (list.length === 0) return <EmptyState section="Architecture" />

  const mods = activeModules({
    defs: COMPONENT_DEFS,
    componentIds: Object.keys(entities),
    objectiveId: missionPlan.objectiveId,
  })
  const toggle = (id) => setExpanded(e => ({ ...e, [id]: !e[id] }))

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '16px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>Arquitetura do sistema</h2>
        <span style={{ ...mono, fontSize: 12, color: 'var(--ink4)' }}>módulos de software · clique num card para ver a descrição</span>
      </div>

      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        {SOFTWARE_LAYERS.map(layer => {
          const layerMods = mods.filter(m => m.layer === layer.id)
          return (
            <div key={layer.id} style={{
              flex: '1 1 0', minWidth: 0, border: '1px solid var(--rule)', borderRadius: 8,
              background: 'var(--paper2)', overflow: 'hidden',
            }}>
              <div style={{ padding: '9px 12px', borderBottom: '1px solid var(--rule)', borderTop: `2px solid ${layer.color}` }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{layer.label}</div>
              </div>
              <div style={{ padding: '8px 10px' }}>
                {layerMods.length === 0 && (
                  <div style={{ ...mono, fontSize: 12, color: 'var(--ink4)', padding: '6px 2px' }}>
                    nenhum módulo nesta camada
                  </div>
                )}
                {layerMods.map(m => {
                  const open = !!expanded[m.id]
                  return (
                    <button key={m.id} onClick={() => toggle(m.id)} style={{
                      display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                      border: '1px solid var(--rule)', borderLeft: `3px solid ${layer.color}`,
                      background: 'var(--paper)', borderRadius: 5, padding: '8px 10px', marginBottom: 6,
                      transition: 'all .14s',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>{m.label}</span>
                        <span style={{ ...mono, fontSize: 11, color: 'var(--ink4)', marginLeft: 'auto' }}>{m.file}</span>
                      </div>
                      {open && <div style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.45, marginTop: 6 }}>{m.desc}</div>}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
