import { useEffect, useState } from 'react'
import useForge, { COMPONENT_DEFS, STATUS } from '../../store/useForge'
import { getFramework, getObjective, SOURCE_LABEL } from '../../mission/index.js'

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
// Mission nav = live mission summary. The builder itself lives in the
// center workspace (MissionSection); this rail mirrors its state.
function MissionNav() {
  const { missionPlan, live, entities } = useForge()
  const fw = getFramework(missionPlan.frameworkId)
  const obj = getObjective(missionPlan.objectiveId)
  const v = live?.validation
  const eco = live?.eco || { massG: 0, priceBRL: 0, currentmA: 0 }

  if (!fw) {
    return (
      <div style={{ padding: '8px', fontSize: 11, color: 'var(--navyt3)', lineHeight: 1.6 }}>
        Escolha a competição no painel central para começar a missão.
      </div>
    )
  }

  return (
    <>
      <SectionLabel>Missão</SectionLabel>
      <Readout rows={[
        ['competição', fw.name],
        ['objetivo', obj ? obj.label.split(' ')[0] : '—'],
        ['módulos', Object.keys(entities).length],
      ]} />

      <div style={{ height: 10 }} />
      <SectionLabel>Validação ao vivo</SectionLabel>
      <Readout rows={[
        ['requisitos', v ? v.summary.rules : '—'],
        ['erros', v?.summary.errors ?? 0, v?.summary.errors ? 'var(--err2)' : 'var(--ok2)'],
        ['avisos', v?.summary.warnings ?? 0, v?.summary.warnings ? 'var(--warn2)' : 'var(--navyt2)'],
      ]} />

      <div style={{ height: 10 }} />
      <SectionLabel>Economia</SectionLabel>
      <Readout rows={[
        ['massa', `${eco.massG} g`],
        ['custo', `R$ ${eco.priceBRL}`, missionPlan.budgetBRL && eco.priceBRL > missionPlan.budgetBRL ? 'var(--err2)' : undefined],
        ['consumo', `${eco.currentmA.toFixed(0)} mA`],
      ]} />
    </>
  )
}

function HardwareNav() {
  const { entities, selectedId, selectEntity, toggleHardware } = useForge()
  const groups = { mcu: [], sensor: [], comm: [], storage: [], power: [] }
  Object.values(entities).forEach(e => { if (groups[e.def.category]) groups[e.def.category].push(e) })
  const GROUP_LABELS = { mcu: 'Processamento', sensor: 'Sensores', comm: 'Comunicação', storage: 'Armazenamento', power: 'Energia' }
  const missing = Object.values(COMPONENT_DEFS).filter(d => !entities[d.id])

  if (Object.keys(entities).length === 0) {
    return <div style={{ padding: '8px', fontSize: 11, color: 'var(--navyt3)', lineHeight: 1.6 }}>Monte a missão na seção Mission para popular o hardware.</div>
  }

  return (
    <>
      {Object.entries(groups).filter(([, items]) => items.length).map(([cat, items]) => (
        <div key={cat} style={{ marginBottom: 12 }}>
          <SectionLabel>{GROUP_LABELS[cat]}</SectionLabel>
          {items.map(e => (
            <NavItem key={e.id} label={e.def.friendly || e.def.label} active={selectedId === e.id}
              dot={STATUS_COLOR[e.status]} right={e.def.label} onClick={() => selectEntity(e.id)} />
          ))}
        </div>
      ))}
      {missing.length > 0 && (
        <>
          <SectionLabel>Adicionar componente</SectionLabel>
          {missing.map(d => (
            <NavItem key={d.id}
              label={d.comingSoon ? `${d.friendly || d.label}` : `+ ${d.friendly || d.label}`}
              right={d.comingSoon ? 'em breve' : d.label}
              onClick={() => toggleHardware(d.id)} />
          ))}
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
  const { entities, selectEntity, runScan, isScanning, live } = useForge()
  const list = Object.values(entities)
  if (!list.length) return <Empty />
  const issues = (live?.validation?.issues || []).filter(i => i.severity !== 'info')
  return (
    <>
      <SectionLabel>Problemas</SectionLabel>
      {issues.length === 0 && <div style={{ padding: '4px 8px', fontSize: 11, color: 'var(--ok2)' }}>Nenhum problema ativo</div>}
      {issues.map((iss, i) => (
        <NavItem key={i} label={iss.title}
          right={SOURCE_LABEL[iss.source] || iss.source}
          dot={iss.severity === 'error' ? 'var(--err2)' : 'var(--warn2)'}
          onClick={() => iss.targets?.[0] && selectEntity(iss.targets[0])} />
      ))}
      <GhostButton label={isScanning ? 'Verificando…' : 'Rodar I2C/SPI scan'} onClick={runScan} />
    </>
  )
}

function TelemetryNav() {
  const { entities, telemetry, seq } = useForge()
  if (!Object.keys(entities).length) return <Empty />
  const metrics = [
    entities.bmp280 && 'Temperatura',
    entities.bmp280 && 'Pressão',
    entities.mpu6050 && 'Aceleração Z',
    entities.esp32 && 'Heap livre',
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

function AnalyticsNav() {
  return (
    <>
      <SectionLabel>Sessão de testes</SectionLabel>
      <div style={{ padding: '4px 8px', fontSize: 11, color: 'var(--navyt2)', lineHeight: 1.7 }}>
        Eventos de uso registrados localmente: cliques, navegação, fiação, tentativas e falhas.
        Use após a sessão com usuários para priorizar o desenvolvimento.
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
  telemetry:    TelemetryNav,
  serialtest:   SerialTestNav,
  analytics:    AnalyticsNav,
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
  const { activeSection, hwLink, navWidth, missionPlan } = useForge()
  const Content = NAV_CONTENT[activeSection]
  const missionName = (missionPlan.name || '').trim()
  const fw = getFramework(missionPlan.frameworkId)

  return (
    <div style={{
      width: navWidth, flexShrink: 0, position: 'relative',
      background: 'var(--navy2)',
      borderRight: '1px solid rgba(255,255,255,.04)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* header — only renders once the user has named a mission */}
      {(missionName || fw) && (
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--navyb)', flexShrink: 0 }}>
          {missionName && (
            <>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--navyt3)', marginBottom: 4 }}>Projeto ativo</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--navyt)', letterSpacing: '-.01em' }}>{missionName}</div>
            </>
          )}
          {fw && (
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, color: 'var(--navyt3)', marginTop: missionName ? 3 : 0 }}>{fw.name}</div>
          )}
        </div>
      )}

      {/* scrollable nav */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 8px' }}>
        {Content ? <Content /> : null}
      </div>

      {/* footer: HONEST physical link state — never fake-positive */}
      <div style={{ padding: '10px 12px', borderTop: '1px solid var(--navyb)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: '.06em' }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: hwLink.connected ? 'var(--ok2)' : 'var(--navyt3)',
            boxShadow: hwLink.connected ? '0 0 4px var(--ok2)' : 'none',
          }} />
          <span style={{ color: 'var(--navyt2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {hwLink.connected ? `ESP32 real · ${hwLink.port || 'serial'}` : 'Sem hardware físico · simulação'}
          </span>
        </div>
      </div>

      <ResizeHandle />
    </div>
  )
}
