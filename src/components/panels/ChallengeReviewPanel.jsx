import { useEffect, useState } from 'react'
import useForge from '../../store/useForge'
import * as session from '../../lib/session.js'
import { isAvailable } from '../../lib/api.js'
import { OBJECTIVE_CATEGORIES_BY_ID } from '../../mission/index.js'
import { mono, slab, CREAM, GOLD } from '../onboarding/posterKit.jsx'

// ──────────────────────────────────────────────────────────────────
// ChallengeReviewPanel — admin moderation queue for organisation
// challenge submissions. Approve → the challenge joins the public board
// (store.challenges); reject → it stays hidden with a note. Reuses the
// existing admin guard (auth.user.isAdmin) + the poster design tokens.
// ──────────────────────────────────────────────────────────────────

const catLabel = (id) => OBJECTIVE_CATEGORIES_BY_ID[id]?.label || id
const STATUS_LABEL = { pending: 'pendente', approved: 'aprovado', rejected: 'rejeitado' }
const STATUS_COLOR = { pending: 'var(--warn2, #C8831A)', approved: 'var(--ok2, #3A9060)', rejected: 'var(--err2, #C04030)' }

export default function ChallengeReviewPanel() {
  const user = useForge(s => s.auth.user)
  const queue = useForge(s => s.challengeQueue)
  const counts = useForge(s => s.challengeCounts)
  const [filter, setFilter] = useState('pending')

  const isAdmin = !!user?.isAdmin

  useEffect(() => { if (isAdmin) session.loadReviewQueue(filter === 'all' ? undefined : filter) }, [isAdmin, filter])

  if (!isAdmin) {
    return <Centered title="Fila de revisão de desafios" text={isAvailable() === false
      ? 'Inicie o servidor (npm run server) e entre como administrador para revisar submissões.'
      : 'Área restrita ao administrador da plataforma. Entre com uma conta de administrador para continuar.'} />
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '20px 26px', background: 'var(--poster-bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <h2 style={{ ...slab, margin: 0, fontSize: 22, color: CREAM }}>Fila de revisão de desafios</h2>
        <span style={{ flex: 1 }} />
        <button onClick={() => session.loadReviewQueue(filter === 'all' ? undefined : filter)} style={ghost}>atualizar</button>
      </div>
      <p style={{ ...mono, fontSize: 11.5, color: 'var(--poster-fg-dim)', margin: '0 0 16px' }}>
        {counts.pending} pendentes · {counts.approved} aprovados · {counts.rejected} rejeitados
      </p>

      {/* status filter */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {['pending', 'approved', 'rejected', 'all'].map(s => {
          const active = filter === s
          const label = s === 'all' ? 'todos' : STATUS_LABEL[s]
          return (
            <button key={s} onClick={() => setFilter(s)} style={{
              ...mono, fontSize: 11, letterSpacing: '.04em', padding: '5px 12px', borderRadius: 14, cursor: 'pointer',
              border: `1px solid ${active ? GOLD : 'var(--poster-line)'}`,
              background: active ? 'var(--poster-card-sel)' : 'transparent',
              color: active ? CREAM : 'var(--poster-fg-dim)',
            }}>{label}{s !== 'all' ? ` · ${counts[s] ?? 0}` : ''}</button>
          )
        })}
      </div>

      {queue.length === 0 && (
        <div style={{ ...mono, fontSize: 12.5, color: 'var(--poster-fg-dim)', border: '1px dashed var(--poster-line)', borderRadius: 'var(--r-md)', padding: '20px' }}>
          Nenhuma submissão {filter === 'all' ? '' : STATUS_LABEL[filter]} no momento.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {queue.map(c => <ReviewCard key={c.id} c={c} />)}
      </div>
    </div>
  )
}

function ReviewCard({ c }) {
  const [note, setNote] = useState(c.reviewNote || '')
  const [busy, setBusy] = useState(false)

  const act = async (decision) => {
    setBusy(true)
    await session.reviewChallenge(c.id, decision, note)
    setBusy(false)
  }

  return (
    <div style={{ border: '1px solid var(--poster-line)', borderRadius: 'var(--r-lg)', background: 'var(--poster-card)', padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
        <span style={{ ...slab, fontSize: 15, fontWeight: 700, color: CREAM }}>{c.org}</span>
        <span style={{ ...mono, fontSize: 10, letterSpacing: '.06em', color: GOLD }}>{[c.location, catLabel(c.category)].filter(Boolean).join(' · ')}</span>
        <span style={{ flex: 1 }} />
        <span style={{ ...mono, fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: STATUS_COLOR[c.status] }}>{STATUS_LABEL[c.status]}</span>
      </div>
      <div style={{ ...mono, fontSize: 10, color: 'var(--poster-fg-dim)', marginBottom: 8 }}>
        enviado por {c.submitterName || 'anônimo'}{c.contact ? ` · ${c.contact}` : ''}
      </div>

      <div style={{ fontSize: 13, lineHeight: 1.5, color: CREAM, marginBottom: 8 }}>{c.problem}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, ...mono, fontSize: 11.5, lineHeight: 1.5, color: 'var(--poster-fg-dim)', marginBottom: 10 }}>
        {c.cost && <div><div style={{ color: CREAM, marginBottom: 2 }}>custo do problema</div>{c.cost}</div>}
        {c.value && <div><div style={{ color: CREAM, marginBottom: 2 }}>o que uma solução vale</div>{c.value}</div>}
      </div>

      <input value={note} onChange={e => setNote(e.target.value)} placeholder="nota de revisão (opcional)"
        style={{ width: '100%', boxSizing: 'border-box', padding: '7px 9px', borderRadius: 6, border: '1px solid var(--poster-line)', background: 'var(--poster-input)', color: CREAM, ...mono, fontSize: 11.5, marginBottom: 10, outline: 'none' }} />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => act('approved')} disabled={busy || c.status === 'approved'} style={btn('var(--ok2, #3A9060)', busy || c.status === 'approved')}>aprovar</button>
        <button onClick={() => act('rejected')} disabled={busy || c.status === 'rejected'} style={btn('var(--err2, #C04030)', busy || c.status === 'rejected')}>rejeitar</button>
        {c.status !== 'pending' && <button onClick={() => act('pending')} disabled={busy} style={btn('var(--warn2, #C8831A)', busy)}>voltar p/ pendente</button>}
      </div>
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
const btn = (color, disabled) => ({
  ...slab, fontSize: 12.5, fontWeight: 700, padding: '7px 16px', borderRadius: 'var(--r-sm)', cursor: disabled ? 'default' : 'pointer',
  border: `1px solid ${color}`, background: 'transparent', color, opacity: disabled ? 0.45 : 1,
})
