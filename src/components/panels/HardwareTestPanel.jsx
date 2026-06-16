import { useEffect, useMemo, useRef, useState } from 'react'
import useForge, { COMPONENT_DEFS } from '../../store/useForge'
import EmptyState from './EmptyState'
import DigitalTwin from './DigitalTwin'
import LogDoctorCard from './debug/LogDoctorCard'
import TaskHighlightStrip from '../ui/TaskHighlightStrip'
import { usePanelWidth } from '../ui/usePanelWidth'
import { PanelDivider } from '../ui/Resizable'
import {
  buildSubsystems, TEST_STAGES, stageById,
  planComm, planInterfaces, planSensor, planSensors, planIntegration, planSystem,
  buildReport,
} from '../../mission/hwtest.js'
import { track } from '../../lib/analytics.js'

// ──────────────────────────────────────────────────────────────────
// HardwareTestPanel — the AIT (Assembly, Integration & Testing) bench.
// Reads like a satellite test-campaign document: a printed-paper block
// diagram of the spacecraft subsystems on the left/center, a CI-style
// validation pipeline that gates stage-by-stage, and a terminal that
// logs each operational step as it runs. Everything is component-driven
// (the diagram is generated from placed hardware) and honest (a sensor
// only "passes" when it is actually wired; the link is tagged real vs
// simulated). Results persist in the store for the session + export to a
// signed-style report.
// ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: "'Space Mono', monospace" }
const CONSOLE_BG = '#101A2B'
const EMPTY = {}   // stable default so useMemo deps don't churn

// cls → terminal line color
const LINE_COLOR = {
  ok: '#5BB587', err: '#E0795F', warn: '#E3A132',
  rx: '#8FC0F0', tx: '#C9A227', info: 'rgba(231,237,247,.5)',
}
// verdict → ui color token
const ST_COLOR = {
  passed: 'var(--ok2)', failed: 'var(--err2)', warn: 'var(--warn2)',
  running: 'var(--acc)', skipped: 'var(--ink4)', idle: 'var(--ink4)',
}
const ST_LABEL = {
  passed: 'passou', failed: 'falhou', warn: 'ressalva',
  running: 'rodando', skipped: 'pulado', idle: 'não rodou',
}
// a stage "clears" the gate (unlocks the next) when it passed, was waved
// through with a caution (warn) or explicitly skipped past a failure.
const cleared = (st) => st === 'passed' || st === 'warn' || st === 'skipped'

export default function HardwareTestPanel() {
  const entities = useForge(s => s.entities)
  const wires = useForge(s => s.wires)
  const wiring = useForge(s => s.live?.wiring) || EMPTY
  const hwLink = useForge(s => s.hwLink)
  const missionPlan = useForge(s => s.missionPlan)
  const hwtest = useForge(s => s.hwtest)
  const selectTestBlock = useForge(s => s.selectTestBlock)
  const startHwTestStage = useForge(s => s.startHwTestStage)
  const finishHwTestStage = useForge(s => s.finishHwTestStage)
  const skipHwTestGate = useForge(s => s.skipHwTestGate)
  const resetHwTest = useForge(s => s.resetHwTest)
  const openPhaseReview = useForge(s => s.openPhaseReview)
  const askAssistant = useForge(s => s.askAssistant)

  const [term, setTerm] = useState([])         // current/last terminal play-out
  const [activeStage, setActiveStage] = useState('comm')
  const [hoverStage, setHoverStage] = useState(null)   // reveal stage detail on hover (Part D1)
  const [showTwin, setShowTwin] = useState(false)   // digital-twin view of a selected sensor
  const [pipeW, setPipeW] = usePanelWidth('forge.hwtestPipeW', 248, 200, 380)
  const [ctxW, setCtxW] = usePanelWidth('forge.hwtestCtxW', 300, 240, 460)
  const timers = useRef([])
  const termRef = useRef(null)

  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  useEffect(() => { termRef.current?.scrollTo(0, 1e6) }, [term])

  const subsystems = useMemo(
    () => buildSubsystems({ defs: COMPONENT_DEFS, entities, wires, wiring }),
    [entities, wires, wiring],
  )
  const sensorIds = Object.keys(entities).filter(id => COMPONENT_DEFS[id]?.category === 'sensor')

  if (Object.keys(entities).length === 0) return <EmptyState section="Testing" />

  const stages = hwtest.stages
  const selected = hwtest.selected
  const running = hwtest.running
  const real = hwLink.connected
  // a supported sensor selected on the diagram can open its digital twin
  const twinSensor = selected.find(id => id === 'mpu6050' || id === 'bmp280')

  // gate lock: stage n is locked until the previous stage cleared
  const isLocked = (id) => {
    const idx = TEST_STAGES.findIndex(s => s.id === id)
    if (idx <= 0) return false
    const prev = TEST_STAGES[idx - 1]
    return !cleared(stages[prev.id]?.status)
  }

  // ── run a stage: build its plan, play the steps onto the terminal,
  //    then commit the verdict to the store ──────────────────────────
  const buildPlan = (id, opts = {}) => {
    const ctx = { defs: COMPONENT_DEFS, entities, wires, wiring, hwLink }
    switch (id) {
      case 'comm':        return planComm(ctx)
      case 'interfaces':  return planInterfaces(ctx)
      case 'sensors':     return opts.sensor ? planSensor(opts.sensor, ctx) : planSensors(sensorIds, ctx)
      case 'integration': return planIntegration(selected, ctx)
      case 'system':      return planSystem(ctx)
      default:            return { status: 'warn', summary: '—', steps: [] }
    }
  }

  const runStage = (id, opts = {}) => {
    if (running) return
    setActiveStage(id)
    const plan = buildPlan(id, opts)
    startHwTestStage(id)
    setTerm([{ text: `▶ ${stageById(id)?.label || id}${opts.sensor ? ` · ${COMPONENT_DEFS[opts.sensor]?.label}` : ''}`, cls: 'info' }])
    const steps = plan.steps || []
    steps.forEach((step, i) => {
      timers.current.push(setTimeout(() => setTerm(t => [...t, step]), 240 * (i + 1)))
    })
    timers.current.push(setTimeout(() => {
      setTerm(t => [...t, { text: `■ veredito: ${ST_LABEL[plan.status]} · ${plan.summary}`, cls: plan.status === 'passed' ? 'ok' : plan.status === 'failed' ? 'err' : 'warn' }])
      // single-sensor run merges into the sensors stage without discarding
      // the other sensors' verdicts
      const label = stageById(id)?.label || id
      if (id === 'sensors' && opts.sensor) finishHwTestStage(id, { ...mergeSensor(stages.sensors?.result, plan, sensorIds), label })
      else finishHwTestStage(id, { ...plan, label })
    }, 240 * (steps.length + 1)))
  }

  // show a completed stage's stored steps when its card is selected
  const showStage = (id) => {
    setActiveStage(id)
    const res = stages[id]?.result
    if (res) setTerm([{ text: `▣ ${stageById(id)?.label} · último resultado`, cls: 'info' }, ...res.steps, { text: `■ ${ST_LABEL[stages[id].status]} · ${res.summary}`, cls: stages[id].status === 'passed' ? 'ok' : stages[id].status === 'failed' ? 'err' : 'warn' }])
    else setTerm([{ text: `${stageById(id)?.label} — ainda não executado`, cls: 'info' }])
  }

  // block-diagram status: which verdict tints each block / node
  const blockStatus = (block) => {
    if (block.id === 'obc' || block.id === 'comms') return stages.comm?.status
    if (block.id === 'bus') return stages.interfaces?.status
    if (block.id === 'sensors') return stages.sensors?.status
    return undefined
  }
  const nodeStatus = (id) => stages.sensors?.result?.perSensor?.[id]?.status

  const onExport = (fmt) => {
    const { filenameBase, json, txt } = buildReport({ missionName: missionPlan.name, stages, subsystems, real })
    const body = fmt === 'json' ? JSON.stringify(json, null, 2) : txt
    const blob = new Blob([body], { type: fmt === 'json' ? 'application/json' : 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${filenameBase}.${fmt}`; a.click()
    URL.revokeObjectURL(url)
    track('hwtest_export', { target: fmt })
  }

  const ranCount = TEST_STAGES.filter(s => cleared(stages[s.id]?.status)).length
  const testsCleared = ranCount >= TEST_STAGES.length

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--paper)' }}>
      <TaskHighlightStrip section="hwtest" />
      {/* header */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', background: 'var(--paper2)', borderBottom: '1px solid var(--rule)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>Bancada de testes · AIT</span>
          <span style={{ ...mono, fontSize: 11, letterSpacing: '.06em', color: 'var(--ink4)' }}>
            {missionPlan.name || 'sem nome'} · montagem, integração e teste · {ranCount}/{TEST_STAGES.length} etapas
          </span>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{
          ...mono, fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase',
          padding: '3px 9px', borderRadius: 'var(--r-sm)',
          background: real ? 'rgba(46,122,79,.16)' : 'rgba(227,161,50,.16)',
          color: real ? 'var(--ok2)' : 'var(--warn2)',
        }}>{real ? 'hardware real' : 'banco simulado'}</span>
        <button onClick={() => onExport('txt')} style={ghostBtn}>relatório .txt</button>
        <button onClick={() => onExport('json')} style={ghostBtn}>.json</button>
        <button onClick={() => { resetHwTest(); setTerm([]); setActiveStage('comm') }} style={ghostBtn}>reiniciar</button>
        <button onClick={() => openPhaseReview('testing')} disabled={!testsCleared}
          title={testsCleared ? 'revisão de prontidão antes da telemetria' : 'conclua as etapas de teste primeiro'}
          style={{ ...ghostBtn, border: 'none', background: testsCleared ? 'var(--btn-bg)' : 'var(--paper4)', color: testsCleared ? 'var(--btn-fg)' : 'var(--ink4)', cursor: testsCleared ? 'pointer' : 'not-allowed' }}>
          revisar e avançar →
        </button>
      </div>

      {/* main: pipeline · diagram+terminal · context */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* ── pipeline (CI-style gated stages) ──────────────────────── */}
        <div style={{ width: pipeW, flexShrink: 0, borderRight: '1px solid var(--rule)', background: 'var(--paper2)', overflowY: 'auto', padding: '12px 12px' }}>
          <div style={{ ...mono, fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 10 }}>Pipeline de validação</div>
          {TEST_STAGES.map((s, i) => {
            const st = stages[s.id]?.status || 'idle'
            const locked = isLocked(s.id)
            const active = activeStage === s.id
            const isRun = running === s.id
            // compact by default — detail (blurb, result, run/skip) only on
            // the active or hovered stage so all five fit without scrolling.
            const detail = active || hoverStage === s.id
            return (
              <div key={s.id} style={{ position: 'relative', paddingLeft: 22, marginBottom: 6 }}
                onMouseEnter={() => setHoverStage(s.id)} onMouseLeave={() => setHoverStage(h => (h === s.id ? null : h))}>
                {/* connector rail */}
                {i < TEST_STAGES.length - 1 && <div style={{ position: 'absolute', left: 9, top: 20, bottom: -6, width: 2, background: 'var(--rule)' }} />}
                <span style={{
                  position: 'absolute', left: 2, top: 4, width: 15, height: 15, borderRadius: '50%',
                  border: `2px solid ${ST_COLOR[isRun ? 'running' : st]}`,
                  background: st === 'passed' ? 'var(--ok2)' : 'var(--paper2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }} className={isRun ? 'pulse' : ''}>
                  {st === 'passed' && <span style={{ color: 'var(--paper)', fontSize: 10, fontWeight: 800 }}>✓</span>}
                  {st === 'failed' && <span style={{ color: 'var(--err2)', fontSize: 11, fontWeight: 800 }}>!</span>}
                </span>
                <button onClick={() => !locked && showStage(s.id)} disabled={locked} title={locked ? 'desbloqueia quando a etapa anterior passa' : s.why} style={{
                  display: 'block', width: '100%', textAlign: 'left', cursor: locked ? 'not-allowed' : 'pointer',
                  border: `1px solid ${active ? 'var(--acc)' : 'var(--rule)'}`, borderRadius: 6,
                  background: active ? 'rgba(158,74,44,.05)' : 'var(--paper)', padding: detail ? '7px 9px' : '5px 9px', opacity: locked ? 0.55 : 1,
                }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ ...mono, fontSize: 11, color: 'var(--ink4)' }}>{s.n}</span>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{s.label}</span>
                    <span style={{ ...mono, fontSize: 9.5, letterSpacing: '.06em', textTransform: 'uppercase', color: ST_COLOR[isRun ? 'running' : st], marginLeft: 'auto' }}>
                      {locked ? '🔒' : ST_LABEL[isRun ? 'running' : st]}
                    </span>
                  </div>
                  {detail && <div style={{ fontSize: 12, color: 'var(--ink3)', lineHeight: 1.45, marginTop: 3 }}>{s.blurb}</div>}
                  {detail && stages[s.id]?.result && st !== 'idle' && (
                    <div style={{ ...mono, fontSize: 11, color: ST_COLOR[st], marginTop: 4 }}>{stages[s.id].result.summary}</div>
                  )}
                </button>
                {/* run / gate controls — only on the active/hovered stage */}
                {detail && !locked && s.id !== 'integration' && (
                  <button onClick={() => runStage(s.id)} disabled={!!running} style={runBtn(!!running)}>
                    {isRun ? 'rodando…' : st === 'idle' ? 'executar' : 'reexecutar'}
                  </button>
                )}
                {detail && st === 'failed' && (
                  <button onClick={() => { if (window.confirm(`Pular "${s.label}" com uma falha NÃO resolvida? Isso será registrado no log de verificação.`)) skipHwTestGate(s.id, s.label) }} title="prosseguir pulando um portão de validação" style={{ ...runBtn(false), border: '1px dashed var(--err2)', color: 'var(--err2)', background: 'transparent' }}>
                    pular portão ⚠
                  </button>
                )}
              </div>
            )
          })}
        </div>

        <PanelDivider w={pipeW} setW={setPipeW} side="right" />

        {/* ── diagram + terminal ────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'auto', background: 'var(--paper)' }}>
            {/* toggle: a selected sensor can open its live digital twin */}
            {twinSensor && (
              <button onClick={() => setShowTwin(v => !v)} style={{
                position: 'absolute', top: 10, right: 10, zIndex: 5,
                padding: '5px 11px', borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${showTwin ? 'var(--rule)' : 'var(--acc)'}`,
                background: showTwin ? 'var(--paper2)' : 'var(--btn-bg)',
                color: showTwin ? 'var(--ink3)' : 'var(--btn-fg)',
                ...mono, fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase',
              }}>{showTwin ? 'ver diagrama' : 'gêmeo digital →'}</button>
            )}
            {showTwin && twinSensor ? (
              <DigitalTwin sensorId={twinSensor} />
            ) : (
              <BlockDiagram
                blocks={subsystems} selected={selected} running={running}
                blockStatus={blockStatus} nodeStatus={nodeStatus}
                onPick={(id, e) => selectTestBlock(id, e.shiftKey || e.metaKey || e.ctrlKey)}
              />
            )}
          </div>
          {/* terminal */}
          <div style={{ height: 184, flexShrink: 0, display: 'flex', flexDirection: 'column', background: CONSOLE_BG, borderTop: '1px solid var(--rule)' }}>
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', borderBottom: '1px solid rgba(231,237,247,.08)' }}>
              <span style={{ ...mono, fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(231,237,247,.6)' }}>Console de teste</span>
              <div style={{ flex: 1 }} />
              <button onClick={() => setTerm([])} style={{ ...mono, fontSize: 10.5, letterSpacing: '.06em', textTransform: 'uppercase', background: 'none', border: 'none', color: 'rgba(231,237,247,.5)', cursor: 'pointer' }}>limpar</button>
            </div>
            <div ref={termRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', ...mono, fontSize: 12.5, lineHeight: 1.6 }}>
              {term.length === 0 && <div style={{ color: 'rgba(231,237,247,.28)' }}># execute uma etapa do pipeline para ver os passos do teste</div>}
              {term.map((l, i) => (
                <div key={i} style={{ color: LINE_COLOR[l.cls] || 'rgba(231,237,247,.8)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{l.text}</div>
              ))}
            </div>
          </div>
        </div>

        <PanelDivider w={ctxW} setW={setCtxW} side="left" />

        {/* ── context panel: selection + integration + breakdown ────── */}
        <ContextPanel
          width={ctxW}
          selected={selected} stages={stages}
          log={hwtest.log} onAsk={askAssistant}
          running={running} onClearSel={() => useForge.getState().clearTestSelection()}
          onRunIntegration={() => runStage('integration')}
          integrationLocked={isLocked('integration')}
          onRunSensor={(id) => runStage('sensors', { sensor: id })}
        />
      </div>
    </div>
  )
}

// merge a single-sensor run into the sensors-stage result, recomputing
// the overall verdict from every sensor's latest status.
function mergeSensor(prev, single, sensorIds) {
  const perSensor = { ...(prev?.perSensor || {}) }
  perSensor[single.sensor] = single
  const statuses = sensorIds.map(id => perSensor[id]?.status).filter(Boolean)
  const status = statuses.includes('failed') ? 'failed' : statuses.includes('warn') ? 'warn' : statuses.length ? 'passed' : 'warn'
  const ok = statuses.filter(s => s === 'passed').length
  return { status, perSensor, summary: `${ok}/${sensorIds.length} sensor(es) OK`, steps: single.steps }
}

// ── the mission-present-only integration diagram ─────────────────
// Shows only components the mission actually has. Sensors are nested
// INSIDE the ESP32/OBC block with the I²C bus drawn as an internal line.
// EPS/COMMS/Payload/BUS "ausente" blocks are dropped entirely.
function BlockDiagram({ blocks, selected, running, blockStatus, nodeStatus, onPick }) {
  const obc = blocks.find(b => b.id === 'obc')
  const sensors = blocks.find(b => b.id === 'sensors')
  const presentBlocks = blocks.filter(b => b.present && b.id !== 'obc' && b.id !== 'sensors' && b.id !== 'bus')
  const sensorNodes = sensors?.nodes || []
  const hasObc = obc?.present

  // layout: OBC is the main container; sensors nest inside it
  const obcX = 60, obcY = 40
  const nodeW = 155, nodeH = 80, nodeGap = 14
  const sensorAreaW = Math.max(sensorNodes.length * (nodeW + nodeGap) - nodeGap, 200)
  const obcW = Math.max(sensorAreaW + 60, 420)
  const obcH = sensorNodes.length > 0 ? 260 : 140
  const busY = obcY + 100

  // any other present blocks (EPS, COMMS) sit alongside if present
  const sideX = obcX + obcW + 40

  return (
    <svg viewBox={`0 0 ${Math.max(sideX + 220, obcW + 140)} ${obcH + 80}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%', minWidth: 400, display: 'block' }}>
      <text x="20" y="22" style={{ ...mono }} fontSize="11" letterSpacing="2" fill="var(--ink4)">DIAGRAMA DE INTEGRAÇÃO · COMPONENTES DA MISSÃO</text>

      {hasObc && (
        <g>
          {/* OBC outer container */}
          <rect x={obcX} y={obcY} width={obcW} height={obcH} rx="8"
            fill="var(--paper2)" stroke={blockStatus(obc) ? ST_COLOR[blockStatus(obc)] : 'var(--ink3)'}
            strokeWidth="1.8" className={running === 'comm' ? 'pulse' : ''} />
          <rect x={obcX} y={obcY} width={52} height={18} rx="3" fill={blockStatus(obc) ? ST_COLOR[blockStatus(obc)] : 'var(--ink3)'} opacity="0.9" />
          <text x={obcX + 26} y={obcY + 13} textAnchor="middle" style={mono} fontSize="10" fontWeight="700" fill="var(--paper)">OBC</text>
          <text x={obcX + 62} y={obcY + 14} style={mono} fontSize="10.5" letterSpacing="1" fill="var(--ink4)">C&DH</text>
          <text x={obcX + 14} y={obcY + 42} fontSize="14" fontWeight="600" fill="var(--ink)">Computador de bordo</text>
          <text x={obcX + 14} y={obcY + 58} style={mono} fontSize="11" fill="var(--ink3)">
            {obc.components?.map(id => COMPONENT_DEFS[id]?.label).join(', ') || 'ESP32'}
          </text>

          {/* I²C bus line inside the OBC block */}
          {sensorNodes.length > 0 && (
            <g>
              <line x1={obcX + 20} y1={busY} x2={obcX + obcW - 20} y2={busY}
                stroke="var(--ink3)" strokeWidth="2" strokeDasharray="6 3" />
              <text x={obcX + 24} y={busY - 6} style={mono} fontSize="9" letterSpacing="1" fill="var(--ink4)">I²C BUS</text>
            </g>
          )}

          {/* sensor nodes nested inside the OBC block */}
          {sensorNodes.map((n, i) => {
            const nx = obcX + 30 + i * (nodeW + nodeGap)
            const ny = busY + 16
            const st = nodeStatus(n.id)
            const isSel = selected.includes(n.id)
            const ne = st ? ST_COLOR[st] : n.wired ? 'var(--ink3)' : 'var(--warn2)'
            return (
              <g key={n.id} onClick={(e) => onPick(n.id, e)} style={{ cursor: 'pointer' }}>
                {/* bus tap line from the I²C bus to the sensor */}
                <line x1={nx + nodeW / 2} y1={busY} x2={nx + nodeW / 2} y2={ny}
                  stroke={n.wired ? 'var(--ok2)' : 'var(--warn2)'} strokeWidth="1.4" />
                <circle cx={nx + nodeW / 2} cy={busY} r="3" fill={n.wired ? 'var(--ok2)' : 'var(--warn2)'} />
                <rect x={nx} y={ny} width={nodeW} height={nodeH} rx="6"
                  fill={isSel ? 'var(--poster-card-sel)' : 'var(--paper)'}
                  stroke={isSel ? 'var(--acc)' : ne} strokeWidth={isSel ? 2.4 : 1.4} />
                <text x={nx + 10} y={ny + 18} fontSize="12.5" fontWeight="600" fill="var(--ink)">{n.part}</text>
                <text x={nx + 10} y={ny + 34} style={mono} fontSize="10" fill="var(--ink4)">{n.role}</text>
                <text x={nx + 10} y={ny + 50} style={mono} fontSize="10" fill="var(--ink3)">{n.bus}{n.addr ? ` · ${n.addr}` : ''}</text>
                <text x={nx + 10} y={ny + 66} style={mono} fontSize="10" fill={n.wired ? 'var(--ok2)' : 'var(--warn2)'}>{n.wired ? '● conectado' : '○ não conectado'}</text>
                {st && <circle cx={nx + nodeW - 12} cy={ny + 14} r="5" fill={ST_COLOR[st]} stroke="var(--paper)" strokeWidth="1.5" />}
              </g>
            )
          })}
        </g>
      )}

      {/* other present blocks beside the OBC (e.g. COMMS, EPS if present) */}
      {presentBlocks.map((b, i) => {
        const bx = sideX, by = obcY + i * 120
        const st = blockStatus(b)
        const isSel = b.components?.some(id => selected.includes(id))
        const edge = st ? ST_COLOR[st] : 'var(--ink3)'
        return (
          <g key={b.id} onClick={b.components?.length === 1 ? (e) => onPick(b.components[0], e) : undefined}
            style={{ cursor: b.components?.length === 1 ? 'pointer' : 'default' }}>
            <rect x={bx} y={by} width={190} height={100} rx="6"
              fill={isSel ? 'var(--poster-card-sel)' : 'var(--paper2)'}
              stroke={isSel ? 'var(--acc)' : edge} strokeWidth={isSel ? 2.4 : 1.6} />
            <rect x={bx} y={by} width={48} height={18} rx="3" fill={edge} opacity="0.9" />
            <text x={bx + 24} y={by + 13} textAnchor="middle" style={mono} fontSize="10" fontWeight="700" fill="var(--paper)">{b.acro}</text>
            <text x={bx + 14} y={by + 42} fontSize="14" fontWeight="600" fill="var(--ink)">{b.label}</text>
            <foreignObject x={bx + 14} y={by + 50} width={162} height={40}>
              <div style={{ fontSize: 11, lineHeight: 1.35, color: 'var(--ink3)' }}>
                {b.components.map(id => COMPONENT_DEFS[id]?.label).join(', ')}
              </div>
            </foreignObject>
            {st && <circle cx={bx + 174} cy={by + 84} r="5" fill={ST_COLOR[st]} stroke="var(--paper)" strokeWidth="1.5" />}
            {/* connector line to OBC */}
            {hasObc && <line x1={obcX + obcW} y1={obcY + obcH / 2} x2={bx} y2={by + 50}
              stroke="var(--ink3)" strokeWidth="1.2" strokeDasharray="4 4" />}
          </g>
        )
      })}

      {/* no components at all */}
      {!hasObc && sensorNodes.length === 0 && presentBlocks.length === 0 && (
        <text x="60" y="70" fontSize="13" fill="var(--ink4)">Nenhum componente na missão ainda.</text>
      )}
    </svg>
  )
}
// ── per-stage failure knowledge → specific, non-generic AI diagnosis ──
const STAGE_DIAGNOSIS = {
  comm: { cause: 'A placa não respondeu ao ping dentro do tempo limite.', fixes: ['Confirme o cabo USB (de dados, não só de energia) e a porta.', 'Verifique a baud 115200 e se outro programa não está ocupando a serial.', 'Pressione EN/RESET na placa e detecte novamente.'] },
  interfaces: { cause: 'O barramento I²C não respondeu como esperado.', fixes: ['Confirme SDA=GPIO21 e SCL=GPIO22 (ou os pinos da sua fiação).', 'Verifique os resistores de pull-up (~4.7k) em SDA e SCL.', 'Confirme a alimentação 3V3 dos periféricos.'] },
  integration: { cause: 'Conflito ao exercitar os componentes no mesmo barramento.', fixes: ['Verifique endereços I²C duplicados — use o strap SDO/AD0 para separar.', 'Confira contenção/temporização no barramento compartilhado.'] },
  system: { cause: 'A sequência de pré-voo reprovou em um ou mais subsistemas.', fixes: ['Revise individualmente as etapas reprovadas acima.'] },
}
const SENSOR_FIX = {
  bmp280: ['BMP280 responde em 0x76 (SDO=GND) ou 0x77 (SDO=3V3) — confira o strap.', 'Confirme VCC=3V3, GND, SDA→GPIO21, SCL→GPIO22.', 'Verifique pull-ups de ~4.7k no barramento I²C.'],
  mpu6050: ['MPU6050 responde em 0x68 (AD0=GND) ou 0x69 (AD0=3V3).', 'Confirme VCC=3V3, GND, SDA→GPIO21, SCL→GPIO22.', 'Com vários dispositivos, verifique conflito de endereço.'],
  gps_neo6m: ['NEO-6M usa UART — TX→RX2(16), RX→TX2(17) cruzados.', 'Confirme baud 9600 e alimentação 3V3; antena com vista do céu para fix.'],
}
function diagnoseFailure(stageId, result) {
  const errLines = (result?.steps || []).filter(s => s.cls === 'err').map(s => s.text)
  const base = STAGE_DIAGNOSIS[stageId] || { cause: 'O teste reprovou.', fixes: ['Revise os passos do console acima.'] }
  let fixes = base.fixes
  if (stageId === 'sensors' && result?.perSensor) {
    const failed = Object.values(result.perSensor).filter(r => r.status === 'failed')
    if (failed.length) fixes = failed.flatMap(r => SENSOR_FIX[r.sensor] || ['Verifique alimentação (3V3/GND) e a fiação SDA/SCL.'])
  }
  return { cause: base.cause, fixes, errLines }
}

// ── right context panel — layered disclosure (tabs/accordion) ───────
// Default view: pass/fail summary + next action. AI diagnostic and raw
// live data sit behind taps so the panel stays compact.
const CTX_TABS = [
  { id: 'summary', label: 'Resumo' },
  { id: 'diagnosis', label: 'Diagnóstico' },
  { id: 'livedata', label: 'Dados' },
]
function ContextPanel({ width = 300, selected, stages, log = [], onAsk, running, onClearSel, onRunIntegration, integrationLocked, onRunSensor }) {
  const sel = selected.map(id => COMPONENT_DEFS[id]).filter(Boolean)
  const breakdown = stages.system?.result?.breakdown
  const [ctxTab, setCtxTab] = useState('summary')
  const [doctorOpen, setDoctorOpen] = useState(false)
  const [logFilter, setLogFilter] = useState('all')

  const cov = TEST_STAGES.reduce((a, s) => {
    const st = stages[s.id]?.status || 'idle'
    if (st === 'passed') a.passed++
    else if (st === 'failed') a.failed++
    else if (st === 'warn' || st === 'skipped') a.warn++
    else a.notRun++
    return a
  }, { passed: 0, failed: 0, warn: 0, notRun: 0 })
  const ran = TEST_STAGES.length - cov.notRun

  const failedStage = TEST_STAGES.find(s => stages[s.id]?.status === 'failed')
  const diag = failedStage ? diagnoseFailure(failedStage.id, stages[failedStage.id]?.result) : null
  const askChat = () => {
    if (!failedStage) return
    onAsk?.(`No meu ESP32, o teste "${failedStage.label}" reprovou. ${diag.cause} Linhas de erro: ${diag.errLines.join(' | ') || '(sem detalhe)'}. Quais as causas mais prováveis e como resolvo? Sou de uma equipe universitária de satélite (CubeSat).`)
  }

  const shownLog = log.filter(e => logFilter === 'all' || (logFilter === 'fail' ? e.status === 'failed' : e.status === 'passed')).slice().reverse()
  const clock = (iso) => new Date(iso).toTimeString().slice(0, 8)

  return (
    <div style={{ width, flexShrink: 0, borderLeft: '1px solid var(--rule)', background: 'var(--paper2)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* tab bar */}
      <div style={{ display: 'flex', gap: 2, padding: '8px 10px 0', borderBottom: '1px solid var(--rule)', flexShrink: 0 }}>
        {CTX_TABS.map(t => (
          <button key={t.id} onClick={() => setCtxTab(t.id)} style={{
            ...mono, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase',
            padding: '5px 10px', borderRadius: '5px 5px 0 0', cursor: 'pointer',
            border: `1px solid ${ctxTab === t.id ? 'var(--rule)' : 'transparent'}`,
            borderBottom: ctxTab === t.id ? '1px solid var(--paper2)' : '1px solid var(--rule)',
            background: ctxTab === t.id ? 'var(--paper2)' : 'transparent',
            color: ctxTab === t.id ? 'var(--ink)' : 'var(--ink4)',
            marginBottom: -1,
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 13px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* ── SUMMARY TAB: pass/fail + next action ── */}
        {ctxTab === 'summary' && (
          <>
            {/* coverage */}
            <div>
              <div style={{ ...mono, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 6 }}>Cobertura</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <CovCell n={`${ran}/${TEST_STAGES.length}`} label="executados" color="var(--ink)" />
                <CovCell n={cov.passed} label="passou" color="var(--ok2)" />
                <CovCell n={cov.failed} label="falhou" color="var(--err2)" />
              </div>
            </div>

            {/* next action checkpoint */}
            <CheckpointCard log={log} stages={stages} />

            {/* per-stage pass/fail strip */}
            <div>
              <div style={{ ...mono, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 6 }}>Etapas</div>
              {TEST_STAGES.map(s => {
                const st = stages[s.id]?.status || 'idle'
                return (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 0', borderBottom: '1px solid var(--rule2)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      background: st === 'passed' ? 'var(--ok2)' : st === 'failed' ? 'var(--err2)' : st === 'running' ? 'var(--acc)' : 'var(--ink4)' }} />
                    <span style={{ fontSize: 12.5, color: st === 'idle' ? 'var(--ink4)' : 'var(--ink)', flex: 1 }}>{s.label}</span>
                    <span style={{ ...mono, fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: ST_COLOR[st] || 'var(--ink4)' }}>{ST_LABEL[st] || '—'}</span>
                  </div>
                )
              })}
            </div>

            {/* selection / integration */}
            {sel.length > 0 && (
              <div>
                <div style={{ ...mono, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 6 }}>Seleção</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 9 }}>
                  {sel.map(d => (
                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 8px', borderRadius: 5, border: '1px solid var(--rule)', background: 'var(--paper)' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--acc)' }} />
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{d.label}</span>
                      <span style={{ ...mono, fontSize: 10.5, color: 'var(--ink4)', marginLeft: 'auto' }}>{d.protocol}</span>
                    </div>
                  ))}
                </div>
                {sel.length === 1 && COMPONENT_DEFS[selected[0]]?.category === 'sensor' && (
                  <button onClick={() => onRunSensor(selected[0])} disabled={!!running} style={solidBtn(!!running)}>testar este sensor</button>
                )}
                {sel.length >= 2 && (
                  <button onClick={onRunIntegration} disabled={!!running || integrationLocked} title={integrationLocked ? 'requer a etapa de sensores aprovada' : ''} style={solidBtn(!!running || integrationLocked)}>
                    testar selecionados juntos
                  </button>
                )}
                <button onClick={onClearSel} style={{ ...ghostBtn, width: '100%', marginTop: 6 }}>limpar seleção</button>
              </div>
            )}

            {breakdown && (
              <div>
                <div style={{ ...mono, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 6 }}>Último pré-voo</div>
                {Object.entries(breakdown).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 0' }}>
                    <span style={{ ...mono, fontSize: 11.5, color: 'var(--ink3)' }}>{k}</span>
                    <span style={{ ...mono, fontSize: 10.5, letterSpacing: '.06em', textTransform: 'uppercase', color: ST_COLOR[v] }}>{ST_LABEL[v]}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── DIAGNOSIS TAB: AI diagnostic + Log Doctor + verification log ── */}
        {ctxTab === 'diagnosis' && (
          <>
            {diag ? (
              <div style={{ border: '1px solid rgba(192,64,48,.35)', borderRadius: 7, background: 'rgba(192,64,48,.05)', padding: '9px 11px' }}>
                <div style={{ ...mono, fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--err2)', marginBottom: 4 }}>Diagnóstico IA · {failedStage.label}</div>
                <div style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.5, marginBottom: 6 }}>{diag.cause}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {diag.fixes.slice(0, 3).map((f, i) => (
                    <div key={i} style={{ fontSize: 12.5, color: 'var(--ink3)', lineHeight: 1.45 }}>→ {f}</div>
                  ))}
                </div>
                <button onClick={askChat} style={{ ...ghostBtn, marginTop: 8, border: '1px solid var(--acc)', color: 'var(--acc2)' }}>continuar no chat →</button>
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: 'var(--ink4)', lineHeight: 1.5 }}>Nenhuma falha detectada — o diagnóstico aparecerá quando um teste reprovar.</div>
            )}

            {/* Log Doctor */}
            <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 10 }}>
              <button onClick={() => setDoctorOpen(o => !o)} style={{
                display: 'flex', alignItems: 'center', gap: 7, width: '100%', textAlign: 'left', cursor: 'pointer',
                background: 'none', border: 'none', padding: 0,
              }}>
                <span style={{ ...mono, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink4)' }}>Log Doctor</span>
                <span style={{ ...mono, fontSize: 10.5, color: 'var(--ink4)', marginLeft: 'auto' }}>{doctorOpen ? '−' : '+'}</span>
              </button>
              {!doctorOpen && <div style={{ fontSize: 12, color: 'var(--ink4)', lineHeight: 1.5, marginTop: 5 }}>Diagnostique a saída serial cruzada com o gêmeo digital.</div>}
              {doctorOpen && <div style={{ marginTop: 8 }}><LogDoctorCard /></div>}
            </div>

            {/* verification log */}
            <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ ...mono, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink4)' }}>Log de verificação</span>
                <span style={{ flex: 1 }} />
                {['all', 'pass', 'fail'].map(f => (
                  <button key={f} onClick={() => setLogFilter(f)} style={{
                    ...mono, fontSize: 9.5, letterSpacing: '.04em', textTransform: 'uppercase',
                    padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
                    border: `1px solid ${logFilter === f ? 'var(--acc)' : 'var(--rule)'}`,
                    background: logFilter === f ? 'rgba(158,74,44,.06)' : 'transparent',
                    color: logFilter === f ? 'var(--ink)' : 'var(--ink4)',
                  }}>{f === 'all' ? 'tudo' : f === 'pass' ? 'passou' : 'falhou'}</button>
                ))}
              </div>
              {shownLog.length === 0 ? (
                <div style={{ ...mono, fontSize: 11.5, color: 'var(--ink4)' }}>nenhum teste executado ainda</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 200, overflowY: 'auto' }}>
                  {shownLog.map((e, i) => (
                    <div key={i} style={{ ...mono, fontSize: 11, lineHeight: 1.4, color: 'var(--ink3)' }}>
                      <span style={{ color: 'var(--ink4)' }}>[{clock(e.t)}]</span>{' '}
                      {e.label} — <span style={{ color: ST_COLOR[e.status] }}>{(ST_LABEL[e.status] || e.status).toUpperCase()}</span>
                      {e.summary ? <span style={{ color: 'var(--ink4)' }}> — {e.summary}</span> : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── LIVE DATA TAB: raw serial + parsed readout ── */}
        {ctxTab === 'livedata' && (
          <LiveDataPanel running={running} />
        )}
      </div>
    </div>
  )
}
// between-test checkpoint (Part 6): a compact summary of what just
// completed + the recommended next action, like a phase-review at stage level.
const stageCleared = (st) => st === 'passed' || st === 'warn' || st === 'skipped'
function CheckpointCard({ log, stages }) {
  if (!log.length) return null
  const last = log[log.length - 1]
  const next = TEST_STAGES.find(s => !stageCleared(stages[s.id]?.status))
  const failed = last.status === 'failed'
  return (
    <div style={{ border: `1px solid ${ST_COLOR[last.status] || 'var(--rule)'}`, borderRadius: 7, background: 'var(--paper)', padding: '9px 11px' }}>
      <div style={{ ...mono, fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 4 }}>checkpoint</div>
      <div style={{ fontSize: 13, color: 'var(--ink)' }}>{last.label} — <span style={{ ...mono, fontSize: 11, textTransform: 'uppercase', color: ST_COLOR[last.status] }}>{ST_LABEL[last.status] || last.status}</span></div>
      {last.summary && <div style={{ ...mono, fontSize: 11, color: 'var(--ink4)', marginTop: 3, lineHeight: 1.5 }}>{last.summary}</div>}
      <div style={{ fontSize: 12.5, color: failed ? 'var(--err2)' : 'var(--acc2)', marginTop: 6 }}>
        {failed ? '→ resolva a falha antes de prosseguir' : next ? `→ próximo: ${next.label}` : '✓ todas as etapas concluídas'}
      </div>
    </div>
  )
}

// live data monitor (Part 5): raw serial stream beside a parsed readout of
// the sensor values. Out-of-range values turn red; nominal stays calm.
const LIVE_RANGE = { temperature: [-40, 85], pressure: [300, 1100], accel_z: [0.9, 1.1] }
const numOf = (v) => parseFloat(String(v))
const rawColor = (cls) => ({ err: 'var(--err2)', warn: 'var(--warn2)', ok: 'var(--ok2)', rx: 'var(--acc2)', tx: 'var(--warn2)' }[cls] || 'var(--ink3)')
function LiveDataPanel({ running }) {
  const serialLog = useForge(s => s.serialLog)
  const entities = useForge(s => s.entities)
  const wiring = useForge(s => s.live?.wiring) || EMPTY
  const ids = Object.keys(entities).filter(id => COMPONENT_DEFS[id])
  const raw = serialLog.slice(0, 9)
  return (
    <div style={{ border: '1px solid var(--rule)', borderRadius: 7, background: 'var(--paper)', padding: '9px 11px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
        <span style={{ ...mono, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink4)' }}>Dados ao vivo</span>
        {running && <span className="pulse" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--ok2)' }} />}
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        {/* raw serial */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...mono, fontSize: 9.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 4 }}>serial bruto</div>
          {raw.length === 0 && <div style={{ ...mono, fontSize: 10.5, color: 'var(--ink4)' }}>sem dados</div>}
          {raw.map((l, i) => (
            <div key={i} style={{ ...mono, fontSize: 10.5, lineHeight: 1.5, color: rawColor(l.cls), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.m}>{l.m}</div>
          ))}
        </div>
        {/* parsed readout */}
        <div style={{ flex: 1, minWidth: 0, borderLeft: '1px solid var(--rule2)', paddingLeft: 10 }}>
          <div style={{ ...mono, fontSize: 9.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 4 }}>leitura interpretada</div>
          {ids.length === 0 && <div style={{ ...mono, fontSize: 10.5, color: 'var(--ink4)' }}>sem sensores</div>}
          {ids.map(id => {
            const wired = wiring[id]?.wired
            const readings = wired ? (entities[id].readings || {}) : {}
            const keys = Object.keys(readings)
            return (
              <div key={id} style={{ marginBottom: 5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: wired ? 'var(--ok2)' : 'var(--ink4)' }} />
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)' }}>{COMPONENT_DEFS[id].label}</span>
                </div>
                {!wired && <div style={{ ...mono, fontSize: 10, color: 'var(--ink4)', paddingLeft: 11 }}>não conectado</div>}
                {keys.map(k => {
                  const bad = LIVE_RANGE[k] && (numOf(readings[k]) < LIVE_RANGE[k][0] || numOf(readings[k]) > LIVE_RANGE[k][1])
                  return (
                    <div key={k} style={{ ...mono, fontSize: 10.5, lineHeight: 1.5, paddingLeft: 11, color: bad ? 'var(--err2)' : 'var(--ink3)' }}>
                      {k}: <span style={{ color: bad ? 'var(--err2)' : 'var(--ink)', fontWeight: bad ? 700 : 400 }}>{String(readings[k])}</span>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// coverage summary cell — a big number + label, color-coded (Part 2)
function CovCell({ n, label, color }) {
  return (
    <div style={{ flex: 1, textAlign: 'center', padding: '6px 4px', borderRadius: 6, border: '1px solid var(--rule)', background: 'var(--paper)' }}>
      <div style={{ fontSize: 18, fontWeight: 700, color, lineHeight: 1.1 }}>{n}</div>
      <div style={{ ...mono, fontSize: 9, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink4)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

// ── buttons ─────────────────────────────────────────────────────────
const ghostBtn = {
  ...mono, fontSize: 11, letterSpacing: '.05em', textTransform: 'uppercase',
  padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
  border: '1px solid var(--rule)', background: 'transparent', color: 'var(--ink3)',
}
function runBtn(disabled) {
  return {
    width: '100%', marginTop: 6, padding: '5px 10px', borderRadius: 5,
    border: '1px solid var(--btn-bg)', cursor: disabled ? 'default' : 'pointer',
    background: disabled ? 'var(--paper4)' : 'var(--btn-bg)', color: 'var(--btn-fg)',
    fontSize: 12.5, fontFamily: "'Space Grotesk', sans-serif",
  }
}
function solidBtn(disabled) {
  return {
    width: '100%', padding: '8px 12px', borderRadius: 5, border: 'none',
    cursor: disabled ? 'default' : 'pointer',
    background: disabled ? 'var(--paper4)' : 'var(--btn-bg)', color: 'var(--btn-fg)',
    fontSize: 13, fontFamily: "'Space Grotesk', sans-serif",
  }
}
