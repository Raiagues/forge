// Shared thin-line CAD glyphs per component category — the "drawing" that
// replaces text on component blocks (Hardware catalog + Debug sensor status).
// 1.5px stroke, currentColor, no fills, no emoji. 24×24 viewBox.
const CAT_PATHS = {
  mcu: <g><rect x="6" y="6" width="12" height="12" rx="1" /><rect x="9.5" y="9.5" width="5" height="5" /><path d="M9 6V3M15 6V3M9 21v-3M15 21v-3M6 9H3M6 15H3M21 9h-3M21 15h-3" /></g>,
  sensor: <g><circle cx="12" cy="12" r="2.2" /><path d="M12 9.8V4M16 12h5M12 14.2V20M3 12h5" /><circle cx="12" cy="12" r="6.5" strokeDasharray="2 2.4" /></g>,
  comm: <g><path d="M12 13v8" /><path d="M8.5 21h7" /><path d="M8 9a5 5 0 0 1 8 0" /><path d="M5.5 6.5a8.5 8.5 0 0 1 13 0" /><circle cx="12" cy="11" r="1.4" /></g>,
  storage: <g><path d="M7 4h7l4 4v12H7z" /><path d="M14 4v4h4" /><path d="M10 12h5M10 15h5" /></g>,
  power: <g><rect x="4" y="9" width="14" height="8" rx="1" /><path d="M18 11.5h2v3h-2" /><path d="M8.5 11v4M11 11v4" /></g>,
}

export default function CatGlyph({ cat, size = 22, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color }}
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {CAT_PATHS[cat] || CAT_PATHS.sensor}
    </svg>
  )
}
