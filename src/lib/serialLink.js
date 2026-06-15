// ──────────────────────────────────────────────────────────────────
// Serial link — a module-level SINGLETON that owns the backend serial
// EventSource and the flash/detect HTTP streams. It lives outside the
// React component tree on purpose: the Firmware (Serial Test) screen can
// mount and unmount as the user navigates, but the physical link, the
// detected board and the diagnostic stream survive (Part 4a). All parsed
// state is written into the Zustand store via the fw* actions, so the
// screen is a pure function of store state.
//
// The backend (server/flash.js + serial_bridge.py) owns the port: no
// browser Web Serial popup, one hardcoded port, persistent connection.
// ──────────────────────────────────────────────────────────────────
import useForge from '../store/useForge'

const SERVER = 'http://localhost:3001'

let es = null              // the live EventSource (null when closed)
let reconnectTimer = null

const store = () => useForge.getState()
export const isOpen = () => !!es

// classify a raw line for the platform-wide serial buffer + Log Doctor
function severity(line) {
  if (/not found|failed|error|timeout|missing|brownout|guru meditation/i.test(line)) return 'err'
  if (/warn|retry/i.test(line)) return 'warn'
  if (/ok|ready|complete|ack/i.test(line)) return 'ok'
  return 'info'
}

export function connect() {
  if (es) return
  const s = store()
  const es2 = new EventSource(`${SERVER}/serial`)
  es = es2
  es2.onopen = () => {
    store().fwSetConnected(true)
    store().fwPushSerial('sys', 'monitor conectado · porta gerida pelo backend (sem popup)')
  }
  es2.onmessage = (ev) => {
    const line = ev.data
    if (line.startsWith('#')) { store().fwPushSerial('sys', line.replace(/^#\s?/, '')); return }
    store().fwPushSerial('rx', line)
    store().fwIngestSerial(line)
    // mirror REAL device output into the platform serial buffer so the
    // Serial monitor and the Log Doctor analyze the physical hardware
    store().pushSerial({ m: line, cls: severity(line) })
  }
  es2.onerror = () => {
    if (es2.readyState === EventSource.CLOSED) {
      es = null
      store().fwSetConnected(false)
      store().fwPushSerial('sys', 'conexão serial encerrada')
    } else {
      store().fwPushSerial('sys', 'servidor serial indisponível — rode ./start.sh')
    }
  }
  void s
}

export function disconnect() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  es?.close(); es = null
  store().fwSetConnected(false)
  store().fwPushSerial('sys', 'monitor desconectado')
}

// Called when the screen mounts: if we were connected this session but
// the link is not open (e.g. after a full page reload), try to reopen it
// automatically and report honestly if the server is unreachable.
export function ensureConnected() {
  if (es) return
  const fw = store().fw
  if (!fw.wasConnected) return
  store().fwPushSerial('sys', 'reconectando ao monitor serial…')
  connect()
}

export async function send(line) {
  const msg = (line || '').trim()
  if (!msg) return false
  try {
    const res = await fetch(`${SERVER}/serial/send`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ line: msg }),
    })
    if (res.ok) { store().fwPushSerial('tx', msg); return true }
    store().fwPushSerial('sys', 'serial não conectado — clique Conectar')
    return false
  } catch {
    store().fwPushSerial('sys', 'falha ao enviar — servidor fora do ar')
    return false
  }
}

// stream a fetch body line-by-line into fwIngestLog + fwPushLog
async function streamInto(url, opts) {
  const res = await fetch(url, opts)
  if (!res.body) {
    (await res.text()).split('\n').forEach((l) => l && (store().fwIngestLog(l), store().fwPushLog(l)))
    return
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let i
    while ((i = buffer.indexOf('\n')) >= 0) {
      const l = buffer.slice(0, i); buffer = buffer.slice(i + 1)
      store().fwIngestLog(l); store().fwPushLog(l)
    }
  }
  if (buffer.trim()) { store().fwIngestLog(buffer); store().fwPushLog(buffer) }
}

export async function detect() {
  const fw = store().fw
  if (fw.detecting || fw.flashing) return
  store().fwPatch({ detecting: true, tab: 'build' })
  store().fwSetStage('board', 'active')
  store().fwPushLog('── detectando placa (esptool) ──')
  try { await streamInto(`${SERVER}/detect`) }
  catch (err) { store().fwPushLog(`ERROR: servidor inacessível — rode ./start.sh (${err.message})`) }
  finally { store().fwPatch({ detecting: false }) }
}

export async function flash(payload) {
  const fw = store().fw
  if (fw.flashing || fw.detecting) return
  store().fwPatch({ flashing: true, tab: 'build' })
  store().fwResetForFlash()
  store().fwPushLog('── flash iniciado ──')
  try {
    await streamInto(`${SERVER}/flash`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    store().fwPushLog(`ERROR: servidor de flash inacessível — rode ./start.sh (${err.message})`)
  } finally {
    store().fwPatch({ flashing: false })
  }
}
