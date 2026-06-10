import { useMemo, useState } from 'react'
import useForge, { COMPONENT_DEFS } from '../../store/useForge'
import { activeModules, moduleCode, resolveObjective, SOFTWARE_LAYERS } from '../../mission/index.js'
import EmptyState from './EmptyState'
import CodeEditor from '../ui/CodeEditor'
import SerialTest from './SerialTest'

// ──────────────────────────────────────────────────────────────────
// Firmware — modular workspace. The firmware is NOT one giant file:
// each hardware driver / system service / mission app is its own
// logical module (main.ino + .h files) generated from the mission and
// editable per-module. Edits persist in the store; "reset" returns a
// module to its generated state.
// ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: "'Space Mono', monospace" }
const LAYER_COLOR = Object.fromEntries(SOFTWARE_LAYERS.map(l => [l.id, l.color]))

export default function FirmwarePanel() {
  const {
    entities, mission, missionPlan, live,
    activeModuleId, setActiveModule, firmwareEdits, setFirmwareEdit, resetFirmwareEdit,
  } = useForge()
  const [showSerial, setShowSerial] = useState(false)

  const componentIds = Object.keys(entities)
  const mods = useMemo(
    () => activeModules({ defs: COMPONENT_DEFS, componentIds, objectiveId: missionPlan.objectiveId }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(componentIds), missionPlan.objectiveId],
  )

  if (componentIds.length === 0) return <EmptyState section="Firmware" />

  const current = mods.find(m => m.id === activeModuleId) || mods[0]
  const objective = resolveObjective(missionPlan)
  // the generated code reflects the ACTUAL wiring the user made
  const ctx = {
    componentIds,
    missionName: missionPlan.name || mission.label,
    rateHz: parseFloat(objective?.meta?.rateHz) || 1,
    i2c: live?.i2c,
    uart: live?.uart,
    wiring: live?.wiring,
    addrs: live?.addrs,
  }
  const generated = moduleCode(current, ctx)
  const code = firmwareEdits[current.id] ?? generated
  const edited = firmwareEdits[current.id] != null && firmwareEdits[current.id] !== generated

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '14px 18px 16px' }}>
      {/* file tabs — one logical module per file */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10, flexShrink: 0, flexWrap: 'wrap' }}>
        {mods.map(m => {
          const active = m.id === current.id
          return (
            <button key={m.id} onClick={() => setActiveModule(m.id)} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
              ...mono, fontSize: 9.5,
              border: '1px solid var(--rule)',
              background: active ? 'var(--navy)' : 'var(--paper2)',
              color: active ? 'rgba(255,255,255,.85)' : 'var(--ink3)',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: LAYER_COLOR[m.layer], flexShrink: 0 }} />
              {m.file}{firmwareEdits[m.id] != null ? ' •' : ''}
            </button>
          )
        })}
      </div>

      {/* module identity strip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{current.label}</span>
        <span style={{
          ...mono, fontSize: 7, letterSpacing: '.08em', textTransform: 'uppercase',
          padding: '1px 6px', borderRadius: 2,
          background: `${LAYER_COLOR[current.layer]}22`, color: LAYER_COLOR[current.layer],
        }}>
          {current.layer === 'core' ? 'core — não modifique' : current.layer === 'adaptive' ? 'adaptive — adapte para a missão' : 'mission — construa livremente'}
        </span>
        <span style={{ fontSize: 10, color: 'var(--ink3)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current.desc}</span>
        {edited && (
          <button onClick={() => resetFirmwareEdit(current.id)} style={{
            padding: '3px 10px', borderRadius: 4, fontSize: 9, cursor: 'pointer',
            ...mono, letterSpacing: '.06em', textTransform: 'uppercase',
            border: '1px solid var(--rule)', background: 'var(--paper2)', color: 'var(--warn2)',
          }}>↺ regenerar</button>
        )}
        <button onClick={() => navigator.clipboard?.writeText(code).catch(() => {})} style={{
          padding: '3px 10px', borderRadius: 4, fontSize: 9, cursor: 'pointer',
          ...mono, letterSpacing: '.06em', textTransform: 'uppercase',
          border: '1px solid var(--rule)', background: 'var(--paper2)', color: 'var(--ink3)',
        }}>copiar</button>
        <button onClick={() => setShowSerial(v => !v)} style={{
          padding: '3px 10px', borderRadius: 4, fontSize: 9, cursor: 'pointer',
          ...mono, letterSpacing: '.06em', textTransform: 'uppercase',
          border: '1px solid var(--rule)',
          background: showSerial ? 'var(--navy)' : 'var(--paper2)',
          color: showSerial ? 'rgba(255,255,255,.85)' : 'var(--ink3)',
        }}>Serial</button>
      </div>

      {/* editor + optional inline Serial Test bottom panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <CodeEditor
          value={code}
          onChange={v => setFirmwareEdit(current.id, v)}
          background="#1E283C"
          style={{ flex: 1, minHeight: 0, border: '1px solid var(--rule)', borderRadius: 6 }}
        />
        {showSerial && (
          <div style={{ height: 380, flexShrink: 0, marginTop: 8, border: '1px solid var(--rule)', borderRadius: 6, overflow: 'hidden' }}>
            <SerialTest />
          </div>
        )}
      </div>

      <div style={{ ...mono, fontSize: 8, color: 'var(--ink4)', marginTop: 6, flexShrink: 0 }}>
        {mods.length} módulos · gerados da missão e do hardware · edite e os ajustes ficam no projeto
        {' · '}use o botão Serial para gravar num ESP32 real
      </div>
    </div>
  )
}
