import { useEffect, useMemo, useRef, useState } from 'react'
import useForge, { COMPONENT_DEFS } from '../../store/useForge'
import EmptyState from './EmptyState'
import DigitalTwin from './DigitalTwin'
import LogDoctorCard from './debug/LogDoctorCard'
import { usePanelWidth } from '../ui/usePanelWidth'
import { PanelDivider } from '../ui/Resizable'
import {
  buildSubsystems, SUBSYSTEM_LINKS, TEST_STAGES, stageById,
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
            return (
              <div key={s.id} style={{ position: 'relative', paddingLeft: 22, marginBottom: 8 }}>
                {/* connector rail */}
                {i < TEST_STAGES.length - 1 && <div style={{ position: 'absolute', left: 9, top: 20, bottom: -8, width: 2, background: 'var(--rule)' }} />}
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
                  background: active ? 'rgba(158,74,44,.05)' : 'var(--paper)', padding: '7px 9px', opacity: locked ? 0.55 : 1,
                }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ ...mono, fontSize: 11, color: 'var(--ink4)' }}>{s.n}</span>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{s.label}</span>
                    <span style={{ ...mono, fontSize: 9.5, letterSpacing: '.06em', textTransform: 'uppercase', color: ST_COLOR[isRun ? 'running' : st], marginLeft: 'auto' }}>
                      {locked ? '🔒' : ST_LABEL[isRun ? 'running' : st]}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)', lineHeight: 1.45, marginTop: 3 }}>{s.blurb}</div>
                  {stages[s.id]?.result && st !== 'idle' && (
                    <div style={{ ...mono, fontSize: 11, color: ST_COLOR[st], marginTop: 4 }}>{stages[s.id].result.summary}</div>
                  )}
                </button>
                {/* run / gate controls */}
                {!locked && s.id !== 'integration' && (
                  <button onClick={() => runStage(s.id)} disabled={!!running} style={runBtn(!!running)}>
                    {isRun ? 'rodando…' : st === 'idle' ? 'executar' : 'reexecutar'}
                  </button>
                )}
                {st === 'failed' && (
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
          subsystems={subsystems} selected={selected} stages={stages}
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

// ── the printed-paper subsystem block diagram ───────────────────────
function BlockDiagram({ blocks, selected, running, blockStatus, nodeStatus, onPick }) {
  const byId = Object.fromEntries(blocks.map(b => [b.id, b]))
  const center = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })

  return (
    <svg viewBox="0 0 1000 620" preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%', minWidth: 760, display: 'block' }}>
      {/* title block — like an AIT drawing cartouche */}
      <text x="20" y="26" style={{ ...mono }} fontSize="12" letterSpacing="2" fill="var(--ink4)">DIAGRAMA DE INTEGRAÇÃO DO SATÉLITE · 1U CUBESAT</text>

      {/* connectors */}
      {SUBSYSTEM_LINKS.map((lk, i) => {
        const a = byId[lk.from], b = byId[lk.to]
        if (!a || !b) return null
        const p = center(a), q = center(b)
        const present = a.present && b.present
        return (
          <g key={i}>
            <path d={dogleg(p, q)} fill="none"
              stroke={present ? (lk.kind === 'power' ? 'var(--warn2)' : 'var(--ink3)') : 'var(--rule)'}
              strokeWidth={present ? 1.6 : 1} strokeDasharray={present ? 'none' : '4 5'} />
          </g>
        )
      })}

      {/* blocks */}
      {blocks.map(b => {
        if (b.node) return <SensorsBoundary key={b.id} block={b} selected={selected} status={blockStatus(b)} nodeStatus={nodeStatus} onPick={onPick} />
        const st = blockStatus(b)
        const isSel = b.components?.some(id => selected.includes(id))
        const isRun = b.id === 'comms' && running === 'comm'
        return (
          <Block key={b.id} block={b} status={st} selected={isSel} running={isRun}
            clickable={b.present && b.components?.length === 1}
            onPick={(e) => b.components?.length === 1 && onPick(b.components[0], e)} />
        )
      })}
    </svg>
  )
}

// orthogonal dogleg between two block centers (AIT-drawing routing)
function dogleg(p, q) {
  const my = (p.y + q.y) / 2
  return `M ${p.x} ${p.y} L ${p.x} ${my} L ${q.x} ${my} L ${q.x} ${q.y}`
}

function Block({ block: b, status, selected, running, clickable, onPick }) {
  const present = b.present
  const edge = status ? ST_COLOR[status] : present ? 'var(--ink3)' : 'var(--rule)'
  const fill = selected ? 'var(--poster-card-sel)' : present ? 'var(--paper2)' : 'transparent'
  return (
    <g onClick={clickable ? onPick : undefined} style={{ cursor: clickable ? 'pointer' : 'default' }}>
      <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="6"
        fill={fill} stroke={selected ? 'var(--acc)' : edge} strokeWidth={selected ? 2.4 : present ? 1.6 : 1.2}
        strokeDasharray={present ? 'none' : '5 5'} className={running ? 'pulse' : ''} />
      {/* acronym tab */}
      <rect x={b.x} y={b.y} width={48} height={18} rx="3" fill={present ? edge : 'var(--rule)'} opacity={present ? 0.9 : 0.5} />
      <text x={b.x + 24} y={b.y + 13} textAnchor="middle" style={mono} fontSize="10" fontWeight="700" fill="var(--paper)">{b.acro}</text>
      <text x={b.x + 58} y={b.y + 14} style={mono} fontSize="10.5" letterSpacing="1" fill="var(--ink4)">{b.sub}</text>

      <text x={b.x + 14} y={b.y + 42} fontSize="15" fontWeight="600" fill={present ? 'var(--ink)' : 'var(--ink4)'}>{b.label}</text>
      {b.bus ? (
        <text x={b.x + 14} y={b.y + 62} style={mono} fontSize="11" fill="var(--ink3)">{(b.buses || []).join(' · ') || 'sem barramento'}</text>
      ) : (
        <foreignObject x={b.x + 14} y={b.y + 50} width={b.w - 28} height={b.h - 56}>
          <div style={{ fontSize: 11.5, lineHeight: 1.35, color: present ? 'var(--ink3)' : 'var(--ink4)' }}>
            {present ? b.components.map(id => COMPONENT_DEFS[id]?.label).join(', ') : (b.placeholder ? 'reservado — sem componente' : 'ausente no projeto')}
          </div>
        </foreignObject>
      )}
      {status && <StatusDot x={b.x + b.w - 16} y={b.y + b.h - 16} status={status} />}
    </g>
  )
}

// the Sensors subsystem boundary with one selectable node per sensor
function SensorsBoundary({ block: b, selected, status, nodeStatus, onPick }) {
  const present = b.nodes.length > 0
  const edge = status ? ST_COLOR[status] : present ? 'var(--ink3)' : 'var(--rule)'
  const nw = 165, gap = 18
  const startX = b.x + 20
  return (
    <g>
      <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="8" fill="transparent"
        stroke={edge} strokeWidth={present ? 1.6 : 1.2} strokeDasharray={present ? 'none' : '5 5'} />
      <rect x={b.x} y={b.y} width={56} height={18} rx="3" fill={present ? edge : 'var(--rule)'} opacity={present ? 0.9 : 0.5} />
      <text x={b.x + 28} y={b.y + 13} textAnchor="middle" style={mono} fontSize="10" fontWeight="700" fill="var(--paper)">{b.acro}</text>
      <text x={b.x + 66} y={b.y + 14} style={mono} fontSize="10.5" letterSpacing="1" fill="var(--ink4)">{b.sub} · {b.label}</text>

      {!present && <text x={b.x + 20} y={b.y + 52} fontSize="12" fill="var(--ink4)">nenhum sensor na placa</text>}
      {b.nodes.map((n, i) => {
        const x = startX + i * (nw + gap)
        const st = nodeStatus(n.id)
        const isSel = selected.includes(n.id)
        const ne = st ? ST_COLOR[st] : n.wired ? 'var(--ink3)' : 'var(--warn2)'
        return (
          <g key={n.id} onClick={(e) => onPick(n.id, e)} style={{ cursor: 'pointer' }}>
            <rect x={x} y={b.y + 32} width={nw} height={86} rx="6"
              fill={isSel ? 'var(--poster-card-sel)' : 'var(--paper2)'}
              stroke={isSel ? 'var(--acc)' : ne} strokeWidth={isSel ? 2.4 : 1.4} />
            <text x={x + 12} y={b.y + 52} fontSize="13" fontWeight="600" fill="var(--ink)">{n.part}</text>
            <text x={x + 12} y={b.y + 69} style={mono} fontSize="10.5" fill="var(--ink4)">{n.role}</text>
            <text x={x + 12} y={b.y + 86} style={mono} fontSize="10.5" fill="var(--ink3)">{n.bus}{n.addr ? ` · ${n.addr}` : ''}</text>
            <text x={x + 12} y={b.y + 104} style={mono} fontSize="10.5" fill={n.wired ? 'var(--ok2)' : 'var(--warn2)'}>{n.wired ? '● conectado' : '○ não conectado'}</text>
            {st && <StatusDot x={x + nw - 14} y={b.y + 46} status={st} />}
          </g>
        )
      })}
    </g>
  )
}

function StatusDot({ x, y, status }) {
  return <circle cx={x} cy={y} r="5" fill={ST_COLOR[status]} stroke="var(--paper)" strokeWidth="1.5" />
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

// ── right context panel ─────────────────────────────────────────────
function ContextPanel({ width = 300, subsystems, selected, stages, log = [], onAsk, running, onClearSel, onRunIntegration, integrationLocked, onRunSensor }) {
  const sel = selected.map(id => COMPONENT_DEFS[id]).filter(Boolean)
  const breakdown = stages.system?.result?.breakdown
  // Log Doctor relocated here from the retired Debug section — collapsed by
  // default so it stays out of the way until the user needs a log diagnosis
  const [doctorOpen, setDoctorOpen] = useState(false)
  const [logFilter, setLogFilter] = useState('all')

  // coverage summary (Part 2)
  const cov = TEST_STAGES.reduce((a, s) => {
    const st = stages[s.id]?.status || 'idle'
    if (st === 'passed') a.passed++
    else if (st === 'failed') a.failed++
    else if (st === 'warn' || st === 'skipped') a.warn++
    else a.notRun++
    return a
  }, { passed: 0, failed: 0, warn: 0, notRun: 0 })
  const ran = TEST_STAGES.length - cov.notRun

  // first failed stage → inline AI diagnosis (Part 4)
  const failedStage = TEST_STAGES.find(s => stages[s.id]?.status === 'failed')
  const diag = failedStage ? diagnoseFailure(failedStage.id, stages[failedStage.id]?.result) : null
  const askChat = () => {
    if (!failedStage) return
    onAsk?.(`No meu ESP32, o teste "${failedStage.label}" reprovou. ${diag.cause} Linhas de erro: ${diag.errLines.join(' | ') || '(sem detalhe)'}. Quais as causas mais prováveis e como resolvo? Sou de uma equipe universitária de satélite (CubeSat).`)
  }

  const shownLog = log.filter(e => logFilter === 'all' || (logFilter === 'fail' ? e.status === 'failed' : e.status === 'passed')).slice().reverse()
  const clock = (iso) => new Date(iso).toTimeString().slice(0, 8)

  return (
    <div style={{ width, flexShrink: 0, borderLeft: '1px solid var(--rule)', background: 'var(--paper2)', overflowY: 'auto', padding: '12px 13px', display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* coverage summary (Part 2) */}
      <div>
        <div style={{ ...mono, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 6 }}>Cobertura de teste</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <CovCell n={`${ran}/${TEST_STAGES.length}`} label="executados" color="var(--ink)" />
          <CovCell n={cov.passed} label="passou" color="var(--ok2)" />
          <CovCell n={cov.failed} label="falhou" color="var(--err2)" />
          <CovCell n={cov.notRun} label="restam" color="var(--ink4)" />
        </div>
      </div>

      {/* inline AI diagnosis on failure (Part 4) */}
      {diag && (
        <div style={{ border: '1px solid rgba(192,64,48,.35)', borderRadius: 7, background: 'rgba(192,64,48,.05)', padding: '9px 11px' }}>
          <div style={{ ...mono, fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--err2)', marginBottom: 4 }}>Diagnóstico assistido por IA · {failedStage.label}</div>
          <div style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.5, marginBottom: 6 }}>{diag.cause}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {diag.fixes.slice(0, 3).map((f, i) => (
              <div key={i} style={{ fontSize: 12.5, color: 'var(--ink3)', lineHeight: 1.45 }}>→ {f}</div>
            ))}
          </div>
          <button onClick={askChat} style={{ ...ghostBtn, marginTop: 8, border: '1px solid var(--acc)', color: 'var(--acc2)' }}>continuar no chat →</button>
        </div>
      )}

      {/* selection / integration */}
      <div>
        <div style={{ ...mono, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 6 }}>Seleção</div>
        {sel.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--ink4)', lineHeight: 1.5 }}>
            Clique num bloco para selecioná-lo. Segure <b>Shift</b> para escolher vários e testar a integração entre eles.
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>

      {/* per-subsystem breakdown from the last full-system run */}
      <div>
        <div style={{ ...mono, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 6 }}>Subsistemas</div>
        {subsystems.map(b => (
          <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 0', borderBottom: '1px solid var(--rule2)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: b.present ? 'var(--ok2)' : 'var(--ink4)' }} />
            <span style={{ fontSize: 12.5, color: b.present ? 'var(--ink)' : 'var(--ink4)' }}>{b.label}</span>
            <span style={{ ...mono, fontSize: 10, color: 'var(--ink4)', marginLeft: 'auto' }}>{b.acro}</span>
          </div>
        ))}
      </div>

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

      {/* verification & validation log — timestamped history (Part 2) */}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 168, overflowY: 'auto' }}>
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

      {/* Log Doctor — log-diagnosis assistant, moved from the old Debug
          section. Cross-references device serial output with the twin. */}
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
