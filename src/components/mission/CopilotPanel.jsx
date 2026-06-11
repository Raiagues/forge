import useForge from '../../store/useForge'

// Severity / kind → visual treatment (reuses the global status palette).
const KIND = {
  incompatibility: { color: 'var(--err2)', bg: 'rgba(184,75,44,.07)', tag: 'incompatível' },
  risk:            { color: 'var(--warn2)', bg: 'rgba(200,131,26,.07)', tag: 'risco' },
  suggestion:      { color: 'var(--acc2)', bg: 'rgba(43,94,167,.06)', tag: 'sugestão' },
  tradeoff:        { color: 'var(--acc)',  bg: 'rgba(43,94,167,.06)', tag: 'tradeoff' },
  info:            { color: 'var(--ink3)', bg: 'var(--paper2)',       tag: 'nota' },
}

function Finding({ f, onApply }) {
  const k = KIND[f.kind] || KIND.info
  return (
    <div style={{ borderLeft: `2px solid ${k.color}`, background: k.bg, borderRadius: 3, padding: '9px 11px', marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: k.color }}>{k.tag}</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{f.title}</span>
      </div>
      <div style={{ fontSize: 13.5, color: 'var(--ink3)', lineHeight: 1.55, marginBottom: f.actions?.length ? 7 : 0 }}>{f.detail}</div>
      {f.actions?.map((a, i) => (
        <button key={i} onClick={() => onApply(a)} style={{
          fontFamily: "'Space Grotesk', sans-serif", fontSize: 13.5, cursor: 'pointer',
          padding: '4px 10px', borderRadius: 4, marginRight: 6, marginTop: 2,
          border: '1px solid var(--rule)', background: 'var(--paper)', color: 'var(--ink2)',
        }}>{a.label}</button>
      ))}
    </div>
  )
}

export default function CopilotPanel() {
  const { copilot, closeCopilot, applyFinding, runCopilot } = useForge()
  const { open, running, result, mode } = copilot
  const W = 340

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0, width: W,
      background: 'var(--paper)', borderLeft: '1px solid var(--rule)',
      transform: open ? 'translateX(0)' : `translateX(${W + 8}px)`,
      transition: 'transform .25s cubic-bezier(.4,0,.2,1)',
      zIndex: 30, display: 'flex', flexDirection: 'column',
      boxShadow: open ? '-6px 0 20px rgba(26,24,20,.08)' : 'none',
    }}>
      {/* header */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: running ? 'var(--acc2)' : 'var(--ok2)', boxShadow: '0 0 5px currentColor', color: running ? 'var(--acc2)' : 'var(--ok2)' }} className={running ? 'pulse' : ''} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Copiloto de missão</div>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: 'var(--ink4)', letterSpacing: '.06em' }}>
            {running ? 'analisando…' : mode === 'custom' ? 'análise da descrição' : 'revisão técnica'} · local
          </div>
        </div>
        <button onClick={closeCopilot} style={{
          width: 24, height: 24, borderRadius: 4, border: '1px solid var(--rule)', background: 'var(--paper2)',
          cursor: 'pointer', color: 'var(--ink3)', fontSize: 14,
        }}>×</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        {running && (
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 13.5, color: 'var(--ink4)' }}>
            avaliando requisitos e compatibilidades…
          </div>
        )}

        {!running && !result && (
          <div style={{ fontSize: 14, color: 'var(--ink3)', lineHeight: 1.6 }}>
            Peça uma análise quando quiser. O copiloto revisa requisitos, detecta incompatibilidades e
            sugere melhorias — sem interromper seu fluxo.
            <button onClick={() => runCopilot('analysis')} style={{
              display: 'block', marginTop: 12, padding: '7px 14px', borderRadius: 5, cursor: 'pointer',
              border: 'none', background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontSize: 14,
              fontFamily: "'Space Grotesk', sans-serif",
            }}>Analisar projeto</button>
          </div>
        )}

        {!running && result && (
          <>
            <div style={{
              fontSize: 14, color: 'var(--ink2)', lineHeight: 1.55, marginBottom: 12,
              paddingBottom: 12, borderBottom: '1px solid var(--rule)',
            }}>
              {result.summary?.headline}
              {result.summary?.power && (
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: 'var(--ink4)', marginTop: 6 }}>
                  {result.summary.power.currentmA} mA · autonomia ~{result.summary.power.hours} h
                </div>
              )}
            </div>

            {result.findings.length === 0 && (
              <div style={{ fontSize: 14, color: 'var(--ok)', lineHeight: 1.6 }}>
                Nenhum problema encontrado. O projeto está coerente com os requisitos atuais.
              </div>
            )}
            {result.findings.map((f) => <Finding key={f.id} f={f} onApply={applyFinding} />)}

            <button onClick={() => runCopilot(mode || 'analysis')} style={{
              marginTop: 6, padding: '6px 12px', borderRadius: 5, cursor: 'pointer', width: '100%',
              border: '1px solid var(--rule)', background: 'var(--paper2)', color: 'var(--ink3)',
              fontSize: 13.5, fontFamily: "'Space Grotesk', sans-serif",
            }}>Reanalisar</button>
          </>
        )}
      </div>
    </div>
  )
}
