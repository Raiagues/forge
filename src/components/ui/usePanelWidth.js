import { useCallback, useRef, useState } from 'react'

// Persisted, clamped panel width for the resizable workstation panels.
// The setter clamps to [min,max] and debounces the write so dragging stays
// smooth and each user's layout survives reloads. Kept in its own module
// (not Resizable.jsx) so that file can stay components-only for fast refresh.

const readStored = (key, fallback) => {
  try { const v = parseInt(localStorage.getItem(key), 10); if (Number.isFinite(v)) return v } catch { /* no storage */ }
  return fallback
}

export function usePanelWidth(key, initial, min, max) {
  const [w, setW] = useState(() => Math.min(max, Math.max(min, readStored(key, initial))))
  const t = useRef()
  const set = useCallback((next) => {
    const c = Math.min(max, Math.max(min, Math.round(next)))
    setW(c)
    clearTimeout(t.current)
    t.current = setTimeout(() => { try { localStorage.setItem(key, String(c)) } catch { /* ignore */ } }, 200)
  }, [key, min, max])
  return [w, set]
}
