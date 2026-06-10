import { useEffect, useState } from 'react'
import useForge, { COMPONENT_DEFS, MISSION_TEMPLATES, STATUS } from '../../store/useForge'
import { WORKFLOW_STEPS, FRAMEWORK_LIST } from '../../mission/index.js'

const STATUS_COLOR = {
  [STATUS.OK]: 'var(--ok2)', [STATUS.WARN]: 'var(--warn2)',
  [STATUS.ERR]: 'var(--err2)', [STATUS.SCANNING]: 'var(--acc2)',
  [STATUS.IDLE]: 'var(--ink4)',
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontFamily: "'Space Mono', monospace", fontSize: 7,
      letterSpacing: '.16em', textTransform: 'uppercase',
      color: 'var(--navyt3)', padding: '0 6px', marginBottom: 4,
    }}>{children}</div>
  )
}

function NavItem({ label, active, dot, onClick, right }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '6px 8px', borderRadius: 5, border: 'none',
        background: active ? 'var(--navyb2)' : 'transparent',
        color: active ? 'var(--navyt)' : 'var(--navyt2)',
        fontSize: 12, fontWeight: active ? 500 : 400,
        cursor: 'pointer', width: '100%', textAlign: 'left',
        transition: 'background .15s', marginBottom: 1,
        fontFamily: "'Space Grotesk', sans-serif",
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--navyb)' }}
      onMouseLeave={e => { e.currentTarget.style.background = active ? 'var(--navyb2)' : 'transparent' }}
    >
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {right && <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, color: 'var(--navyt3)', flexShrink: 0 }}>{right}</span>}
      {dot && <span style={{ width: 5, height: 5, borderRadius: '50%', background: dot, flexShrink: 0 }} />}
    </button>
  )
}

function Readout({ rows }) {
  return (
    <div style={{ padding: '4px 8px', fontFamily: "'Space Mono', monospace", fontSize: 9, color: 'var(--navyt2)', lineHeight: 1.85 }}>
      {rows.map(([k, v, c], i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ color: 'var(--navyt3)' }}>{k}</span>
          <span style={{ color: c || 'var(--navyt2)' }}>{v}</span>
        </div>
      ))}
    </div>
  )
}

function GhostButton({ label, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', padding: '6px 8px', marginTop: 8, borderRadius: 5,
      border: '1px solid var(--navyb2)', background: 'transparent',
      color: 'var(--navyt2)', fontSize: 11, cursor: 'pointer',
      fontFamily: "'Space Grotesk', sans-serif",
    }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--navyb)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >{label}</button>
  )
}

// ── per-section nav content ───────────────────────────────────────
function MissionNav() {
  const {
    missionPlan, workflowStep, setWorkflowStep, selectFramework,
    validation, entities, telemetry, runCopilot,
  } = useForge()

  // No framework chosen yet → quick framework picker.
  if (!missionPlan.frameworkId) {
    return (
      <>
        <SectionLabel>Frameworks</SectionLabel>
        {FRAMEWORK_LIST.map(fw => (
          <NavItem key={fw.id} label={fw.name} right={fw.kind === 'custom' ? '✎' : '★'} onClick={() => selectFramework(fw.id)} />
        ))}
        <div style={{ height: 12 }} />
        <SectionLabel>Perfis rápidos</SectionLabel>
        <QuickProfiles />
      </>
    )
  }

  // Framework selected → 10-step workflow rail with completion state.
  const ctx = {
    plan: missionPlan, defs: COMPONENT_DEFS,
    entitiesCount: Object.keys(entities).length,
    telemetryCount: telemetry.length, validation,
  }
  const errors = validation?.summary.errors || 0
  const warnings = validation?.summary.warnings || 0

  return (
    <>
      <SectionLabel>Workflow</SectionLabel>
      {WORKFLOW_STEPS.map(step => {
        const done = step.isComplete(ctx)
        const active = workflowStep === step.id
        return (
          <button key={step.id} onClick={() => setWorkflowStep(step.id)} style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
            padding: '5px 8px', borderRadius: 5, border: 'none', marginBottom: 1, cursor: 'pointer',
            background: active ? 'var(--navyb2)' : 'transparent',
            fontFamily: "'Space Grotesk', sans-serif",
          }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--navyb)' }}
            onMouseLeave={e => { e.currentTarget.style.background = active ? 'var(--navyb2)' : 'transparent' }}>
            <span style={{
              width: 16, height: 16, borderRadius: '50%', flexShrink: 0, fontFamily: "'Space Mono', monospace",
              fontSize: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `1px solid ${done ? 'var(--ok2)' : 'var(--navyt3)'}`,
              background: done ? 'var(--ok2)' : 'transparent',
              color: done ? '#10241A' : 'var(--navyt2)',
            }}>{done ? '✓' : step.n}</span>
            <span style={{ flex: 1, fontSize: 12, color: active ? 'var(--navyt)' : 'var(--navyt2)', fontWeight: active ? 500 : 400 }}>{step.label}</span>
          </button>
        )
      })}

      <div style={{ height: 10 }} />
      <SectionLabel>Validação</SectionLabel>
      <Readout rows={[
        ['requisitos', validation ? validation.summary.rules : '—'],
        ['erros', errors, errors ? 'var(--err2)' : 'var(--ok2)'],
        ['avisos', warnings, warnings ? 'var(--warn2)' : 'var(--navyt2)'],
        ['massa', `${validation ? validation.summary.massG : 0} g`],
      ]} />
      <GhostButton label="◇ Pedir análise ao copiloto" onClick={() => runCopilot('analysis')} />
    </>
  )
}

function QuickProfiles() {
  const loadTemplate = useForge(s => s.loadTemplate)
  return MISSION_TEMPLATES.map(t => (
    <NavItem key={t.id} label={`${t.icon} ${t.label}`} onClick={() => loadTemplate(t.id)} />
  ))
}

function HardwareNav() {
  const { entities, selectedId, selectEntity, addEntity } = useForge()
  const groups = { mcu: [], sensor: [], comm: [], storage: [], power: [] }
  Object.values(entities).forEach(e => { if (groups[e.def.category]) groups[e.def.category].push(e) })
  const GROUP_LABELS = { mcu: 'MCU', sensor: 'Sensores', comm: 'Comunicação', storage: 'Armazenamento', power: 'Energia' }
  const missing = Object.values(COMPONENT_DEFS).filter(d => !entities[d.id])

  if (Object.keys(entities).length === 0) {
    return <div style={{ padding: '8px', fontSize: 11, color: 'var(--navyt3)', lineHeight: 1.6 }}>Carregue uma missão para popular o hardware.</div>
  }

  return (
    <>
      {Object.entries(groups).filter(([, items]) => items.length).map(([cat, items]) => (
        <div key={cat} style={{ marginBottom: 12 }}>
          <SectionLabel>{GROUP_LABELS[cat]}</SectionLabel>
          {items.map(e => (
            <NavItem key={e.id} label={e.def.label} active={selectedId === e.id}
              dot={STATUS_COLOR[e.status]} onClick={() => selectEntity(e.id)} />
          ))}
        </div>
      ))}
      {missing.length > 0 && (
        <>
          <SectionLabel>Adicionar componente</SectionLabel>
          {missing.map(d => <NavItem key={d.id} label={`+ ${d.label}`} onClick={() => addEntity(d.id)} />)}
        </>
      )}
    </>
  )
}

function ArchitectureNav() {
  const { entities, selectEntity, selectedId } = useForge()
  const list = Object.values(entities)
  const ok = list.filter(e => e.status === STATUS.OK).length
  const err = list.filter(e => e.status === STATUS.ERR).length
  const warn = list.filter(e => e.status === STATUS.WARN).length
  const current = list.reduce((s, e) => s + (e.def.current || 0), 0)
  if (!list.length) return <Empty />
  return (
    <>
      <SectionLabel>Visão geral</SectionLabel>
      <Readout rows={[
        ['componentes', list.length],
        ['operacionais', ok, 'var(--ok2)'],
        ...(warn ? [['avisos', warn, 'var(--warn2)']] : []),
        ...(err ? [['falhas', err, 'var(--err2)']] : []),
        ['corrente', `${current} mA`],
      ]} />
      <div style={{ height: 10 }} />
      <SectionLabel>Nós</SectionLabel>
      {list.map(e => (
        <NavItem key={e.id} label={e.def.label} active={selectedId === e.id}
          dot={STATUS_COLOR[e.status]} right={e.def.protocol} onClick={() => selectEntity(e.id)} />
      ))}
    </>
  )
}

function FirmwareNav() {
  const { entities } = useForge()
  const list = Object.values(entities)
  if (!list.length) return <Empty />
  const libs = list.filter(e => e.def.protocol && e.def.protocol !== 'MCU').length
  return (
    <>
      <SectionLabel>Build target</SectionLabel>
      <Readout rows={[
        ['board', 'ESP32-WROOM'],
        ['framework', 'Arduino'],
        ['drivers', libs],
        ['baud', '115200'],
      ]} />
      <div style={{ height: 10 }} />
      <SectionLabel>Periféricos no código</SectionLabel>
      {list.filter(e => e.id !== 'esp32').map(e => (
        <NavItem key={e.id} label={e.def.label} right={e.def.protocol} onClick={() => {}} />
      ))}
    </>
  )
}

function DebugNav() {
  const { entities, selectEntity, selectedId, runScan, isScanning } = useForge()
  const list = Object.values(entities)
  if (!list.length) return <Empty />
  const issues = list.filter(e => e.status === STATUS.ERR || e.status === STATUS.WARN)
  return (
    <>
      <SectionLabel>Problemas</SectionLabel>
      {issues.length === 0 && <div style={{ padding: '4px 8px', fontSize: 11, color: 'var(--ok2)' }}>Nenhum problema ativo</div>}
      {issues.map(e => (
        <NavItem key={e.id} label={e.def.label} active={selectedId === e.id}
          dot={STATUS_COLOR[e.status]} onClick={() => selectEntity(e.id)} />
      ))}
      <GhostButton label={isScanning ? 'Verificando…' : 'Rodar I2C/SPI scan'} onClick={runScan} />
    </>
  )
}

function SerialNav() {
  const { serialLog, clearSerial } = useForge()
  return (
    <>
      <SectionLabel>Conexão</SectionLabel>
      <Readout rows={[
        ['porta', 'COM3'],
        ['baud', '115200'],
        ['linhas', serialLog.length],
        ['estado', 'aberto', 'var(--ok2)'],
      ]} />
      <GhostButton label="Limpar console" onClick={clearSerial} />
    </>
  )
}

function TelemetryNav() {
  const { entities, telemetry, seq } = useForge()
  if (!Object.keys(entities).length) return <Empty />
  const metrics = [
    entities.bme280 && 'Temperatura',
    entities.ccs811 && 'CO₂',
    entities.lipo_2000 && 'Bateria',
    entities.lora_sx1276 && 'RSSI LoRa',
  ].filter(Boolean)
  return (
    <>
      <SectionLabel>Stream</SectionLabel>
      <Readout rows={[
        ['amostras', telemetry.length],
        ['tempo', `t+${seq * 3}s`],
        ['taxa', '0.33 Hz'],
      ]} />
      <div style={{ height: 10 }} />
      <SectionLabel>Métricas</SectionLabel>
      {metrics.map(m => <NavItem key={m} label={m} onClick={() => {}} />)}
    </>
  )
}

function SerialTestNav() {
  return (
    <>
      <SectionLabel>Placa alvo</SectionLabel>
      <Readout rows={[
        ['board', 'ESP32-WROOM-32D'],
        ['baud', '115200'],
        ['porta', 'ttyUSB0 · backend'],
        ['serial', 'sem popup'],
        ['framework', 'Arduino'],
        ['toolchain', 'arduino-cli'],
      ]} />
      <div style={{ height: 10 }} />
      <SectionLabel>Validação</SectionLabel>
      <div style={{ padding: '4px 8px', fontSize: 11, color: 'var(--navyt2)', lineHeight: 1.7 }}>
        Conecte uma vez, faça o flash do Hello World e acompanhe as etapas
        (placa → upload → serial → I2C → sensor) iluminarem a partir da saída
        real do ESP32. O serial reconecta sozinho após cada flash.
      </div>
    </>
  )
}

function Empty() {
  return <div style={{ padding: '8px', fontSize: 11, color: 'var(--navyt3)', lineHeight: 1.6 }}>Carregue uma missão para começar.</div>
}

const NAV_CONTENT = {
  mission:      MissionNav,
  architecture: ArchitectureNav,
  hardware:     HardwareNav,
  firmware:     FirmwareNav,
  debug:        DebugNav,
  serial:       SerialNav,
  telemetry:    TelemetryNav,
  serialtest:   SerialTestNav,
}

// ── resize handle ─────────────────────────────────────────────────
function ResizeHandle() {
  const setNavWidth = useForge(s => s.setNavWidth)
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (!active) return
    const onMove = (e) => setNavWidth(e.clientX - 48) // minus icon sidebar width
    const onUp = () => { setActive(false); document.body.style.cursor = ''; document.body.style.userSelect = '' }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [active, setNavWidth])

  return (
    <div
      onMouseDown={() => setActive(true)}
      title="Arraste para redimensionar"
      style={{
        position: 'absolute', top: 0, right: -3, bottom: 0, width: 6,
        cursor: 'col-resize', zIndex: 25,
        background: active ? 'rgba(74,125,212,.4)' : 'transparent',
        transition: 'background .15s',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(74,125,212,.2)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
    />
  )
}

export default function NavPanel() {
  const { project, activeSection, connectionStatus, navWidth } = useForge()
  const Content = NAV_CONTENT[activeSection]

  return (
    <div style={{
      width: navWidth, flexShrink: 0, position: 'relative',
      background: 'var(--navy2)',
      borderRight: '1px solid rgba(255,255,255,.04)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--navyb)', flexShrink: 0 }}>
        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--navyt3)', marginBottom: 4 }}>Projeto ativo</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--navyt)', letterSpacing: '-.01em' }}>{project.name}</div>
        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, color: 'var(--navyt3)', marginTop: 3 }}>{project.competition} · {project.daysLeft}d</div>
      </div>

      {/* scrollable nav */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 8px' }}>
        {Content ? <Content /> : null}
      </div>

      {/* footer: connection */}
      <div style={{ padding: '10px 12px', borderTop: '1px solid var(--navyb)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: '.06em' }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: connectionStatus === 'connected' ? 'var(--ok2)' : 'var(--err2)',
            boxShadow: connectionStatus === 'connected' ? '0 0 4px var(--ok2)' : 'none',
          }} />
          <span style={{ color: 'var(--navyt2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {connectionStatus === 'connected' ? 'ESP32 · COM3 · 115200' : 'Desconectado'}
          </span>
        </div>
      </div>

      <ResizeHandle />
    </div>
  )
}
