import { useEffect } from 'react'
import useForge from '../../store/useForge'
import * as session from '../../lib/session.js'
import { isAvailable } from '../../lib/api.js'
import { OBJECTIVE_CATEGORIES_BY_ID } from '../../mission/index.js'
import { mono, slab, CREAM, GOLD } from '../onboarding/posterKit.jsx'

// ──────────────────────────────────────────────────────────────────
// MarketIntelPanel — admin-only market-intelligence dashboard over the
// ANONYMIZED organisation challenge submissions: demand by objective
// category, by region (heat), a category×region heat matrix and a monthly
// timeline. No org names / submitter identity are shown — only aggregates.
// Reuses the admin guard + poster design tokens.
// ──────────────────────────────────────────────────────────────────

const catLabel = (id) => OBJECTIVE_CATEGORIES_BY_ID[id]?.label || id

export default function MarketIntelPanel() {
  const user = useForge(s => s.auth.user)
  const intel = useForge(s => s.challengeIntel)
  const isAdmin = !!user?.isAdmin

  useEffect(() => { if (isAdmin) session.loadChallengeIntel() }, [isAdmin])

  if (!isAdmin) {
    return <Centered title="Inteligência de mercado" text={isAvailable() === false
      ? 'Inicie o servidor (npm run server) e entre como administrador para ver a inteligência de mercado.'
      : 'Área restrita ao administrador da plataforma. Entre com uma conta de administrador para continuar.'} />
  }

  const total = intel?.total ?? 0
  const counts = intel?.counts || { pending: 0, approved: 0, rejected: 0 }
  const byCategory = intel?.byCategory || []
  const byRegion = intel?.byRegion || []
  const heat = intel?.heat || []
  const timeline = intel?.timeline || []

  const catMax = Math.max(1, ...byCategory.map(c => c.total))
  const regMax = Math.max(1, ...byRegion.map(r => r.total))
  const tlMax = Math.max(1, ...timeline.map(t => t.total))
  const heatMax = Math.max(1, ...heat.map(h => h.count))

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '20px 26px', background: 'var(--poster-bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <h2 style={{ ...slab, margin: 0, fontSize: 22, color: CREAM }}>Inteligência de mercado</h2>
        <span style={{ flex: 1 }} />
        <button onClick={() => session.loadChallengeIntel()} style={ghost}>atualizar</button>
      </div>
      <p style={{ ...mono, fontSize: 11.5, color: 'var(--poster-fg-dim)', margin: '0 0 18px', lineHeight: 1.5 }}>
        sinal de demanda agregado e anonimizado das submissões de organizações · sem identificação de quem enviou
      </p>

      {/* status cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 24 }}>
        <Stat label="Submissões" value={String(total)} sub="organizações (anônimo)" accent={GOLD} />
        <Stat label="Aprovadas" value={String(counts.approved)} sub="no quadro público" accent="var(--ok2, #3A9060)" />
        <Stat label="Pendentes" value={String(counts.pending)} sub="aguardando revisão" accent="var(--warn2, #C8831A)" />
        <Stat label="Rejeitadas" value={String(counts.rejected)} sub="fora de escopo" accent="var(--err2, #C04030)" />
      </div>

      {total === 0 && (
        <div style={{ ...mono, fontSize: 12.5, color: 'var(--poster-fg-dim)', border: '1px dashed var(--poster-line)', borderRadius: 'var(--r-md)', padding: '20px' }}>
          Ainda não há submissões de organizações. Os agregados aparecem conforme as organizações enviam desafios.
        </div>
      )}

      {total > 0 && (
        <>
          {/* category demand */}
          <Section title="Demanda por categoria" hint="que tipo de missão as organizações pedem">
            {byCategory.map(c => (
              <BarRow key={c.key} label={catLabel(c.key)} value={c.total} max={catMax}
                detail={`${c.approved} aprov. · ${c.pending} pend. · ${c.rejected} rej.`} />
            ))}
          </Section>

          {/* region heat */}
          <Section title="Calor por região" hint="de onde vem a demanda (UF)">
            {byRegion.map(r => (
              <BarRow key={r.key} label={r.key} value={r.total} max={regMax} color={GOLD}
                detail={`${r.approved} aprov. · ${r.pending} pend. · ${r.rejected} rej.`} />
            ))}
          </Section>

          {/* category × region heat matrix */}
          {heat.length > 0 && (
            <Section title="Mapa de calor categoria × região" hint="onde cada tipo de demanda se concentra">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {heat.map(h => {
                  const t = h.count / heatMax
                  return (
                    <div key={`${h.category}|${h.region}`} title={`${catLabel(h.category)} · ${h.region}: ${h.count}`}
                      style={{
                        ...mono, fontSize: 10.5, color: t > 0.55 ? 'var(--poster-bg)' : CREAM,
                        padding: '7px 11px', borderRadius: 8, border: `1px solid ${GOLD}`,
                        background: `color-mix(in srgb, ${GOLD} ${Math.round(20 + t * 70)}%, transparent)`,
                      }}>
                      {h.region} · {catLabel(h.category)} <strong style={{ marginLeft: 4 }}>{h.count}</strong>
                    </div>
                  )
                })}
              </div>
            </Section>
          )}

          {/* timeline */}
          <Section title="Linha do tempo de submissões" hint="volume mensal e quanto foi aprovado">
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 140, padding: '0 4px' }}>
              {timeline.map(t => (
                <div key={t.month} style={{ flex: 1, minWidth: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                  <div style={{ ...mono, fontSize: 10, color: 'var(--poster-fg-dim)' }}>{t.total}</div>
                  <div style={{ width: '100%', maxWidth: 46, height: `${Math.round((t.total / tlMax) * 96)}px`, minHeight: 4, position: 'relative', background: 'var(--poster-card-sel)', border: '1px solid var(--poster-line)', borderRadius: '4px 4px 0 0', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${t.total ? Math.round((t.approved / t.total) * 100) : 0}%`, background: GOLD }} />
                  </div>
                  <div style={{ ...mono, fontSize: 9.5, color: 'var(--poster-fg-dim)', transform: 'rotate(-30deg)', whiteSpace: 'nowrap' }}>{t.month}</div>
                </div>
              ))}
            </div>
            <div style={{ ...mono, fontSize: 10, color: 'var(--poster-fg-dim)', marginTop: 14 }}>
              <span style={{ display: 'inline-block', width: 9, height: 9, background: GOLD, borderRadius: 2, marginRight: 5, verticalAlign: 'middle' }} />aprovadas · barra total = todas as submissões
            </div>
          </Section>
        </>
      )}
    </div>
  )
}

function Section({ title, hint, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
        <h3 style={{ ...slab, margin: 0, fontSize: 16, color: CREAM }}>{title}</h3>
        {hint && <span style={{ ...mono, fontSize: 10.5, color: 'var(--poster-fg-dim)' }}>{hint}</span>}
      </div>
      <div style={{ border: '1px solid var(--poster-line)', borderRadius: 'var(--r-lg)', background: 'var(--poster-card)', padding: 16 }}>{children}</div>
    </div>
  )
}

function BarRow({ label, value, max, detail, color = 'var(--poster-fg)' }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, gap: 10 }}>
        <span style={{ fontSize: 13, color: CREAM }}>{label}</span>
        <span style={{ ...mono, fontSize: 10.5, color: 'var(--poster-fg-dim)' }}>{value}{detail ? ` · ${detail}` : ''}</span>
      </div>
      <div style={{ height: 12, background: 'var(--poster-input)', border: '1px solid var(--poster-line)', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ width: `${Math.round((value / max) * 100)}%`, height: '100%', background: color, transition: 'width .3s' }} />
      </div>
    </div>
  )
}

function Stat({ label, value, sub, accent }) {
  return (
    <div style={{ border: '1px solid var(--poster-line)', borderRadius: 'var(--r-lg)', background: 'var(--poster-card)', padding: '14px 16px' }}>
      <div style={{ ...mono, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--poster-fg-dim)', marginBottom: 6 }}>{label}</div>
      <div style={{ ...slab, fontSize: 28, fontWeight: 700, color: accent || CREAM, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ ...mono, fontSize: 10.5, color: 'var(--poster-fg-dim)', marginTop: 5 }}>{sub}</div>}
    </div>
  )
}

function Centered({ title, text }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 30, background: 'var(--poster-bg)' }}>
      <h2 style={{ ...slab, margin: 0, fontSize: 20, color: CREAM }}>{title}</h2>
      <p style={{ ...mono, fontSize: 12.5, color: 'var(--poster-fg-dim)', maxWidth: 460, textAlign: 'center', lineHeight: 1.6 }}>{text}</p>
    </div>
  )
}

const ghost = { ...mono, fontSize: 11, padding: '6px 12px', borderRadius: 'var(--r-sm)', cursor: 'pointer', border: '1px solid var(--poster-line)', background: 'transparent', color: CREAM }
