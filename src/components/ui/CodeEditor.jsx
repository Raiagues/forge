import { useMemo, useRef } from 'react'

// ──────────────────────────────────────────────────────────────────
// CodeEditor — a lightweight, dependency-free syntax-highlighted editor
// for C/C++/Arduino. One shared component used by every code surface in
// FORGE (Firmware modules + Serial Test sketch) so there is a single
// editing experience, not duplicated textareas.
//
// Technique: a transparent <textarea> (real editing + caret) layered over
// a highlighted <pre> that renders the same text as coloured tokens. Both
// share identical type metrics so they align pixel-for-pixel; the textarea
// drives the <pre>'s scroll. No Monaco/CodeMirror weight — just a regex
// tokenizer, in keeping with the project's minimalist, inline-style ethos.
// ──────────────────────────────────────────────────────────────────

const KEYWORDS = new Set(
  ('if else for while do return break continue switch case default goto sizeof typedef ' +
   'struct enum union class public private protected virtual override new delete this ' +
   'namespace using template typename const constexpr static volatile extern inline ' +
   'register auto void operator friend explicit')
    .split(' '),
)
const TYPES = new Set(
  ('int float double char bool void long short unsigned signed byte boolean word String ' +
   'uint8_t uint16_t uint32_t uint64_t int8_t int16_t int32_t int64_t size_t')
    .split(' '),
)
const CONSTS = new Set('true false HIGH LOW INPUT OUTPUT INPUT_PULLUP LED_BUILTIN NULL nullptr'.split(' '))

// VS Code-ish palette, tuned warm/cool to sit on the soft-navy editor.
const COLORS = {
  comment: '#6E7A8C',
  string: '#D79A6B',
  number: '#9CCDF2',
  keyword: '#C691E6',
  type: '#6FB3E0',
  const: '#4FB7C6',
  pre: '#C97CB4',
  punct: 'rgba(231,237,247,.5)',
  text: 'rgba(231,237,247,.9)',
}

// Ordered alternation: comments → strings/headers → preprocessor → number →
// identifier → whitespace → any single other char. Every char is consumed,
// so the scan is contiguous (no gaps, no zero-length matches).
const TOKEN = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|<[A-Za-z0-9_./]+\.h>)|(#[A-Za-z_]+)|(\b\d[\w.]*\b)|([A-Za-z_]\w*)|(\s+)|([^\sA-Za-z0-9_])/g

function classify(word) {
  if (KEYWORDS.has(word)) return 'keyword'
  if (TYPES.has(word)) return 'type'
  if (CONSTS.has(word) || /^[A-Z][A-Z0-9_]{1,}$/.test(word)) return 'const'
  return 'text'
}

function tokenize(code) {
  const out = []
  let m
  TOKEN.lastIndex = 0
  while ((m = TOKEN.exec(code))) {
    if (m[1]) out.push(['comment', m[1]])
    else if (m[2]) out.push(['string', m[2]])
    else if (m[3]) out.push(['pre', m[3]])
    else if (m[4]) out.push(['number', m[4]])
    else if (m[5]) out.push([classify(m[5]), m[5]])
    else if (m[6]) out.push(['ws', m[6]])
    else out.push(['punct', m[7]])
  }
  return out
}

export default function CodeEditor({
  value, onChange, disabled = false, fontSize = 11.5, background = '#1E283C', style,
}) {
  const taRef = useRef(null)
  const preRef = useRef(null)

  const tokens = useMemo(() => tokenize(value || ''), [value])

  const sync = () => {
    if (preRef.current && taRef.current) {
      preRef.current.scrollTop = taRef.current.scrollTop
      preRef.current.scrollLeft = taRef.current.scrollLeft
    }
  }

  // Type metrics MUST be identical on both layers for them to align.
  const shared = {
    margin: 0, border: 0, padding: '10px 13px',
    fontFamily: "'Space Mono', monospace", fontSize, lineHeight: 1.6,
    tabSize: 2, MozTabSize: 2, whiteSpace: 'pre', wordWrap: 'normal', letterSpacing: 'normal',
    boxSizing: 'border-box',
  }

  return (
    <div style={{
      position: 'relative', overflow: 'hidden', background,
      backgroundImage: 'linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px)',
      backgroundSize: '22px 22px',
      ...style,
    }}>
      <pre ref={preRef} aria-hidden="true" style={{
        ...shared, position: 'absolute', inset: 0, overflow: 'auto',
        color: COLORS.text, pointerEvents: 'none',
      }}>
        <code>
          {tokens.map(([t, s], i) => (t === 'ws' ? s : <span key={i} style={{ color: COLORS[t] || COLORS.text }}>{s}</span>))}
          {'\n'}
        </code>
      </pre>
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={sync}
        disabled={disabled}
        spellCheck={false}
        wrap="off"
        style={{
          ...shared, position: 'absolute', inset: 0, width: '100%', height: '100%',
          resize: 'none', outline: 'none', background: 'transparent',
          color: 'transparent', caretColor: COLORS.text, overflow: 'auto',
        }}
      />
    </div>
  )
}
