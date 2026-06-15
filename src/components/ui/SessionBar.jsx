import { useState } from 'react'
import useForge from '../../store/useForge'
import { isAvailable } from '../../lib/api.js'
import * as session from '../../lib/session.js'

// ──────────────────────────────────────────────────────────────────
// SessionBar — the top-bar account + presence control (deferred backend
// pass). Additive + optional: the platform runs fine single-user, so this
// only surfaces login/team/presence when a backend is reachable. Shows:
//   • live presence avatars of collaborators on the active project
//   • the signed-in user + role, with a team switcher + logout menu
//   • a login/register modal (with demo account quick-fill) when signed out
// ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: "'Space Mono', monospace" }

// deterministic avatar colour from a name/username
const AV_COLORS = ['#C9A227', '#4A7DD4', '#3A9060', '#C8831A', '#C04030', '#7A5CC4', '#2E8B96']
function avatarColor(key = '') {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return AV_COLORS[h % AV_COLORS.length]
}
function initials(name = '') {
  const parts = name.trim().split(/[\s_]+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase()
}

function Avatar({ name, sub, size = 26, ring }) {
  return (
    <span title={sub ? `${name} · ${sub}` : name} style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: avatarColor(name), color: '#fff', ...mono, fontSize: size * 0.4, fontWeight: 700,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      border: ring ? '2px solid var(--paper2)' : 'none', boxShadow: ring ? '0 0 0 1.5px var(--rule)' : 'none',
    }}>{initials(name)}</span>
  )
}

export default function SessionBar() {
  const user = useForge(s => s.auth.user)
  const role = useForge(s => s.auth.role)
  const presence = useForge(s => s.presence)
  const teams = useForge(s => s.teams)
  const activeTeamId = useForge(s => s.activeTeamId)
  const setSection = useForge(s => s.setSection)
  const [modal, setModal] = useState(false)
  const [menu, setMenu] = useState(false)

  const online = presence.online || []

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      {/* presence avatars (only when collaborating) */}
      {online.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ ...mono, fontSize: 10, color: 'var(--ink4)', marginRight: 6, letterSpacing: '.08em' }}>
            {presence.connected ? '● online' : '○'}
          </span>
          <div style={{ display: 'flex' }}>
            {online.slice(0, 5).map((m, i) => (
              <span key={m.id ?? i} style={{ marginLeft: i ? -7 : 0 }}><Avatar name={m.name || m.username} sub={m.subsystem} ring /></span>
            ))}
            {online.length > 5 && <span style={{ ...mono, fontSize: 11, color: 'var(--ink3)', marginLeft: 4 }}>+{online.length - 5}</span>}
          </div>
        </div>
      )}

      {user ? (
        <div style={{ position: 'relative' }}>
          <button onClick={() => setMenu(m => !m)} style={accountBtn}>
            <Avatar name={user.name || user.username} size={22} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{user.name || user.username}</span>
            <span style={{ ...mono, fontSize: 9.5, padding: '1px 6px', borderRadius: 4, background: role === 'manager' ? 'var(--ok2)' : 'var(--navy)', color: '#fff', letterSpacing: '.06em', textTransform: 'uppercase' }}>{role === 'manager' ? 'gestor' : 'membro'}</span>
          </button>
          {menu && (
            <div style={menuCard} onMouseLeave={() => setMenu(false)}>
              <div style={{ ...mono, fontSize: 10, color: 'var(--ink4)', padding: '2px 4px 6px', letterSpacing: '.08em', textTransform: 'uppercase' }}>Equipes</div>
              {teams.map(t => (
                <button key={t.id} onClick={() => { useForge.getState().selectTeam(t.id); session.loadProjects(); setMenu(false) }}
                  style={{ ...menuItem, fontWeight: t.id === activeTeamId ? 700 : 500, color: t.id === activeTeamId ? 'var(--accent, var(--navy))' : 'var(--ink)' }}>
                  {t.id === activeTeamId ? '› ' : ''}{t.name}{t.isDemo ? ' (demo)' : ''}
                </button>
              ))}
              <div style={{ borderTop: '1px solid var(--rule)', margin: '6px 0' }} />
              <button onClick={() => { setSection('team'); setMenu(false) }} style={menuItem}>Equipe & tarefas</button>
              <button onClick={() => { setSection('reports'); setMenu(false) }} style={menuItem}>Relatórios</button>
              {role === 'manager' && <button onClick={() => { setSection('metrics'); setMenu(false) }} style={menuItem}>Métricas de autonomia</button>}
              <div style={{ borderTop: '1px solid var(--rule)', margin: '6px 0' }} />
              <button onClick={() => { session.logout(); setMenu(false) }} style={{ ...menuItem, color: 'var(--err2)' }}>Sair</button>
            </div>
          )}
        </div>
      ) : (
        <button onClick={() => setModal(true)} style={loginBtn}>Entrar</button>
      )}

      {modal && <LoginModal onClose={() => setModal(false)} />}
    </div>
  )
}

function LoginModal({ onClose }) {
  const busy = useForge(s => s.auth.busy)
  const error = useForge(s => s.auth.error)
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const available = isAvailable()

  const submit = async () => {
    const res = mode === 'login' ? await session.login(username, password) : await session.register(username, password, name)
    if (res.ok) onClose()
  }
  // Demo password is NOT hardcoded — it comes from the build env so it is
  // never committed. When unset, quick-pick just fills the username and the
  // tester types the documented password (see SEED_ACCOUNTS.md).
  const demoPw = import.meta.env?.VITE_FORGE_DEMO_PASSWORD || ''
  const demo = async (u) => {
    setUsername(u)
    if (!demoPw) return
    setPassword(demoPw)
    const res = await session.login(u, demoPw)
    if (res.ok) onClose()
  }

  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={e => e.stopPropagation()} style={card}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontFamily: "'Space Grotesk', sans-serif", fontSize: 19, color: 'var(--ink)' }}>{mode === 'login' ? 'Entrar' : 'Criar conta'}</h3>
          <span style={{ flex: 1 }} />
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--ink4)' }}>×</button>
        </div>

        {available === false && (
          <div style={{ ...mono, fontSize: 11.5, color: 'var(--warn2)', background: 'var(--paper3, var(--paper2))', border: '1px solid var(--rule)', borderRadius: 6, padding: '8px 10px', marginBottom: 12, lineHeight: 1.5 }}>
            Servidor de colaboração indisponível. Rode <b>npm run server</b> para habilitar contas, equipes e tempo real. A plataforma funciona normalmente offline (sem colaboração).
          </div>
        )}

        {mode === 'register' && (
          <input placeholder="Nome" value={name} onChange={e => setName(e.target.value)} style={input} />
        )}
        <input placeholder="Usuário" value={username} onChange={e => setUsername(e.target.value)} style={input} />
        <input placeholder="Senha" type="password" value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()} style={input} />

        {error && <div style={{ ...mono, fontSize: 11.5, color: 'var(--err2)', marginBottom: 10 }}>{error}</div>}

        <button onClick={submit} disabled={busy} style={{ ...primary, opacity: busy ? 0.6 : 1 }}>{busy ? '…' : (mode === 'login' ? 'Entrar' : 'Cadastrar')}</button>
        <button onClick={() => setMode(m => m === 'login' ? 'register' : 'login')} style={{ ...linkBtn, marginTop: 8 }}>
          {mode === 'login' ? 'Não tem conta? Cadastre-se' : 'Já tenho conta'}
        </button>

        <div style={{ borderTop: '1px solid var(--rule)', margin: '14px 0 10px' }} />
        <div style={{ ...mono, fontSize: 10, color: 'var(--ink4)', marginBottom: 8, letterSpacing: '.08em', textTransform: 'uppercase' }}>Contas de demonstração{demoPw ? '' : ' (senha em SEED_ACCOUNTS.md)'}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {['manager_forge', 'membro_hardware', 'lider_obsat', 'aluno_hardware'].map(u => (
            <button key={u} onClick={() => demo(u)} disabled={busy} style={demoBtn}>{u}</button>
          ))}
        </div>
      </div>
    </div>
  )
}

const accountBtn = { display: 'flex', alignItems: 'center', gap: 7, border: '1px solid var(--rule)', background: 'var(--paper)', borderRadius: 18, padding: '3px 10px 3px 4px', cursor: 'pointer' }
const loginBtn = { ...mono, fontSize: 12, fontWeight: 600, letterSpacing: '.04em', border: '1px solid var(--rule)', background: 'var(--navy)', color: '#fff', borderRadius: 16, padding: '5px 16px', cursor: 'pointer' }
const menuCard = { position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 210, background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 8, boxShadow: '0 10px 30px rgba(26,24,20,.18)', padding: 8, zIndex: 120 }
const menuItem = { display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', padding: '7px 8px', borderRadius: 5, fontSize: 13, color: 'var(--ink)', fontFamily: "'Space Grotesk', sans-serif" }
const overlay = { position: 'fixed', inset: 0, background: 'rgba(26,24,20,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }
const card = { width: 360, maxWidth: '92vw', background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 12, padding: 22, boxShadow: '0 20px 60px rgba(26,24,20,.3)' }
const input = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', marginBottom: 10, borderRadius: 6, border: '1px solid var(--rule)', background: 'var(--paper2)', color: 'var(--ink)', fontSize: 14, fontFamily: "'Space Grotesk', sans-serif" }
const primary = { width: '100%', padding: '10px', borderRadius: 6, border: 'none', background: 'var(--navy)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: "'Space Grotesk', sans-serif" }
const linkBtn = { width: '100%', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12.5, color: 'var(--ink3)', fontFamily: "'Space Grotesk', sans-serif" }
const demoBtn = { ...mono, fontSize: 11, border: '1px solid var(--rule)', background: 'var(--paper2)', color: 'var(--ink2, var(--ink))', borderRadius: 5, padding: '5px 9px', cursor: 'pointer' }
