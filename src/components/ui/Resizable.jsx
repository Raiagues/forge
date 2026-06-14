import { useCallback, useState } from 'react'

// ──────────────────────────────────────────────────────────────────
// Resizable — shared drag-to-resize handles for the workstation panels.
// Two styles drive a width owned by usePanelWidth (see ./usePanelWidth):
// PanelDivider (a flex sibling, for in-flow columns) and EdgeResizer (an
// absolute edge strip, for absolutely-positioned panels like the Drawer).
// ──────────────────────────────────────────────────────────────────

// pointer-drag wiring shared by both handles. `side` sets the sign:
// 'right' → the panel sits to the LEFT of the handle (drag right grows it);
// 'left'  → the panel sits to the RIGHT of the handle (drag left grows it).
function useDragResize(w, setW, side) {
  return useCallback((e) => {
    e.preventDefault()
    const x0 = e.clientX, w0 = w, dir = side === 'left' ? -1 : 1
    const move = (ev) => setW(w0 + dir * (ev.clientX - x0))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.userSelect = ''
    }
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [w, setW, side])
}

// Flex-sibling divider with a visible grip — place between two flex children.
export function PanelDivider({ w, setW, side = 'right' }) {
  const onPointerDown = useDragResize(w, setW, side)
  const [hot, setHot] = useState(false)
  return (
    <div
      onPointerDown={onPointerDown}
      onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}
      title="arraste para redimensionar"
      style={{
        flexShrink: 0, width: 9, cursor: 'col-resize', alignSelf: 'stretch', zIndex: 4,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
      <span style={{ width: hot ? 3 : 2, height: 40, borderRadius: 2, background: hot ? 'var(--acc)' : 'var(--rule)', transition: 'background .12s, width .12s' }} />
    </div>
  )
}

// Absolute edge strip for absolutely-positioned panels (e.g. the Drawer).
export function EdgeResizer({ w, setW, side = 'left' }) {
  const onPointerDown = useDragResize(w, setW, side)
  const [hot, setHot] = useState(false)
  return (
    <div
      onPointerDown={onPointerDown}
      onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}
      title="arraste para redimensionar"
      style={{
        position: 'absolute', top: 0, bottom: 0, [side]: -3, width: 8, cursor: 'col-resize', zIndex: 40,
        borderLeft: hot ? '2px solid var(--acc)' : '2px solid transparent', transition: 'border-color .12s',
      }} />
  )
}
