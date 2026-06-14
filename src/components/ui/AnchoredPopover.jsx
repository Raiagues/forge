import { useEffect, useRef, useState, useLayoutEffect } from 'react'
import useForge from '../../store/useForge'

// ──────────────────────────────────────────────────────────────────
// AnchoredPopover — inline feedback for disabled / coming-soon
// interactions. Appears immediately adjacent to the clicked element
// (the pattern Linear/Vercel use for unavailable features): one
// sentence explaining WHY the option is unavailable and, when known,
// WHEN it is planned. Dismisses on outside click, Esc or after 5s.
// ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: "'Space Mono', monospace" }
const WIDTH = 264

const HEADER = {
  coming: { label: 'em desenvolvimento', color: 'var(--warn2)' },
  erro:   { label: 'ligação inválida',   color: 'var(--err2)' },
  aviso:  { label: 'atenção na ligação', color: 'var(--warn2)' },
}

export default function AnchoredPopover() {
  const popover = useForge(s => s.popover)
  const closePopover = useForge(s => s.closePopover)
  const askAssistant = useForge(s => s.askAssistant)
  const ref = useRef(null)
  const [pos, setPos] = useState(null)

  // place below the anchor, flipping above / clamping when out of viewport
  useLayoutEffect(() => {
    if (!popover) { setPos(null); return }
    const { x, y, w, h } = popover.anchor
    const ph = ref.current?.offsetHeight || 84
    const left = Math.min(Math.max(8, x + w / 2 - WIDTH / 2), window.innerWidth - WIDTH - 8)
    const below = y + h + 8 + ph < window.innerHeight
    setPos({ left, top: below ? y + h + 8 : Math.max(8, y - ph - 8), below })
  }, [popover])

  useEffect(() => {
    if (!popover) return
    // teaching popovers (with a "Saiba mais" action) must not vanish on a
    // timer before the user can click; coming-soon ones still auto-dismiss
    const timer = popover.learnMore ? null : setTimeout(closePopover, 5000)
    const onDown = (e) => { if (!ref.current?.contains(e.target)) closePopover() }
    const onKey = (e) => { if (e.key === 'Escape') closePopover() }
    // defer so the opening click itself doesn't dismiss it
    const id = setTimeout(() => {
      window.addEventListener('pointerdown', onDown)
      window.addEventListener('keydown', onKey)
    }, 0)
    return () => {
      if (timer) clearTimeout(timer)
      clearTimeout(id)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [popover, closePopover])

  if (!popover) return null
  return (
    <div ref={ref} role="status" style={{
      position: 'fixed', left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: WIDTH, zIndex: 200,
      background: 'var(--paper)', border: '1px solid var(--ink2)', borderRadius: 'var(--r-md)',
      boxShadow: '0 6px 22px rgba(26,24,20,.25)', padding: '10px 12px',
      animation: 'popover-in .14s ease-out',
    }}>
      <div style={{
        ...mono, fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase',
        color: (HEADER[popover.kind] || HEADER.coming).color, marginBottom: 4,
      }}>{(HEADER[popover.kind] || HEADER.coming).label}</div>
      <div style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.45 }}>{popover.message}</div>
      {popover.hint && (
        <div style={{ ...mono, fontSize: 11, color: 'var(--ink3)', lineHeight: 1.5, marginTop: 5 }}>{popover.hint}</div>
      )}
      {popover.learnMore && (
        <button
          onClick={() => { askAssistant(popover.learnMore); closePopover() }}
          style={{
            marginTop: 9, width: '100%', padding: '6px 10px', borderRadius: 5, cursor: 'pointer',
            border: 'none', background: 'var(--btn-bg)', color: 'var(--btn-fg)',
            fontSize: 13, fontFamily: "'Space Grotesk', sans-serif",
          }}>Saiba mais →</button>
      )}
    </div>
  )
}
