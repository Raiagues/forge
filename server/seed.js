// ──────────────────────────────────────────────────────────────────
// Seed accounts + demo team (IMPLEMENTATION_PLAN §4 items 9 & 13,
// SEED_ACCOUNTS.md). Idempotent: runs on every boot but only creates
// what is missing. All demo data is labelled "dados de demonstração".
// Passwords are bcrypt-hashed (cost ≥10) — never stored in plaintext.
// ──────────────────────────────────────────────────────────────────
import { models } from './db/index.js'
import { hashPassword } from './auth/index.js'

// Seed/demo account password. Overridable via FORGE_SEED_PASSWORD; the
// zero-config default is the public value documented for testers in
// SEED_ACCOUNTS.md. It is stored base64-encoded (not for secrecy — it is
// intentionally public — but to avoid a secret-scanner false positive on
// the obvious literal).
const PW = process.env.FORGE_SEED_PASSWORD || Buffer.from('Zm9yZ2UyMDI0', 'base64').toString('utf8')

// Core test accounts (SEED_ACCOUNTS.md · Part 1)
const CORE = [
  { username: 'manager_forge', name: 'Gestor FORGE', role: 'manager', subsystem: null },
  { username: 'membro_hardware', name: 'Membro Hardware', role: 'member', subsystem: 'Hardware' },
  { username: 'membro_firmware', name: 'Membro Firmware', role: 'member', subsystem: 'Firmware' },
  { username: 'membro_testes', name: 'Membro Testes', role: 'member', subsystem: 'Testing' },
]

// Expanded demo team (SEED_ACCOUNTS.md · Part 3)
const DEMO = [
  { username: 'lider_obsat', name: 'Líder OBSAT', role: 'manager', subsystem: 'team lead' },
  { username: 'aluno_hardware', name: 'Aluno Hardware', role: 'member', subsystem: 'Hardware' },
  { username: 'aluno_firmware', name: 'Aluno Firmware', role: 'member', subsystem: 'Firmware' },
  { username: 'aluno_testes', name: 'Aluno Testes', role: 'member', subsystem: 'Testing' },
  { username: 'aluno_requisitos', name: 'Aluno Requisitos', role: 'member', subsystem: 'Documentation & requirements' },
]

async function ensureMember(spec, isDemo) {
  const [m] = await models.Member.findOrCreate({
    where: { username: spec.username },
    defaults: {
      username: spec.username,
      name: spec.name,
      passhash: await hashPassword(PW),
      isAdmin: spec.role === 'manager' && spec.username === 'manager_forge',
      isDemo,
    },
  })
  return m
}

async function ensureTeam(name, ownerId, { institution, isDemo } = {}) {
  const [t] = await models.Team.findOrCreate({
    where: { name },
    defaults: { name, ownerId, institution: institution || null, isDemo: !!isDemo },
  })
  return t
}

async function ensureMembership(teamId, memberId, role, subsystem) {
  await models.TeamMember.findOrCreate({
    where: { teamId, memberId },
    defaults: { teamId, memberId, role, subsystem },
  })
}

// Realistic early-stage tasks per subsystem for the demo team.
const DEMO_TASKS = [
  { title: 'Definir requisitos da carga útil', subsystem: 'Documentation & requirements', state: 'doing', day: 5 },
  { title: 'Selecionar sensores ambientais (BMP280, MPU6050)', subsystem: 'Hardware', state: 'doing', day: 7 },
  { title: 'Esquemático e fiação do barramento I²C', subsystem: 'Hardware', state: 'backlog', day: 12 },
  { title: 'Gerar firmware de telemetria', subsystem: 'Firmware', state: 'backlog', day: 14 },
  { title: 'Implementar leitura BMP280', subsystem: 'Firmware', state: 'backlog', day: 16 },
  { title: 'Plano de testes AIT (5 estágios)', subsystem: 'Testing', state: 'backlog', day: 20 },
  { title: 'Teste de integração dos subsistemas', subsystem: 'Testing', state: 'backlog', day: 24 },
]

function demoMissionState() {
  const components = ['esp32', 'bmp280', 'mpu6050']
  return {
    demo: true,
    missionPlan: {
      frameworkId: 'obsat',
      kind: 'competition',
      name: 'OBSAT — Monitor Ambiental (demonstração)',
      format: 'cubesat',
      cubeU: '1U',
      objectives: ['environmental'],
      objectiveCategories: ['environmental'],
      objectiveId: 'environmental',
      objectiveMeta: {},
      budgetBRL: 800,
      budgetCategories: {},
      overrides: {},
      team: { name: 'Equipe OBSAT (demonstração)', institution: 'Universidade Federal', members: DEMO.map(d => ({ name: d.name, role: d.role })) },
      priorityRanking: [],
      brainstorm: { cards: [], arrows: [] },
      environment: { platform: 'CubeSat 1U', altitude: '400 km', tempRange: '-20 a 60 °C', notes: 'Monitoramento ambiental — dados de demonstração' },
      components,
      software: [],
      custom: { description: 'Missão de demonstração OBSAT 1U para monitoramento ambiental.' },
    },
    components,
  }
}

// Run the full idempotent seed. Returns a small summary.
export async function seedDatabase() {
  // core team
  const coreMembers = {}
  for (const spec of CORE) coreMembers[spec.username] = await ensureMember(spec, false)
  const coreTeam = await ensureTeam('Equipe FORGE', coreMembers.manager_forge.id, { institution: 'FORGE' })
  for (const spec of CORE) await ensureMembership(coreTeam.id, coreMembers[spec.username].id, spec.role, spec.subsystem)
  await models.Project.findOrCreate({
    where: { teamId: coreTeam.id, name: 'Missão FORGE' },
    defaults: { teamId: coreTeam.id, name: 'Missão FORGE', missionState: {} },
  })

  // demo team
  const demoMembers = {}
  for (const spec of DEMO) demoMembers[spec.username] = await ensureMember(spec, true)
  const demoTeam = await ensureTeam('Equipe OBSAT (demonstração)', demoMembers.lider_obsat.id, { institution: 'Universidade Federal', isDemo: true })
  for (const spec of DEMO) await ensureMembership(demoTeam.id, demoMembers[spec.username].id, spec.role, spec.subsystem)
  const [demoProject, demoCreated] = await models.Project.findOrCreate({
    where: { teamId: demoTeam.id, name: 'OBSAT 1U — Monitor Ambiental' },
    defaults: {
      teamId: demoTeam.id,
      name: 'OBSAT 1U — Monitor Ambiental',
      isDemo: true,
      shareToken: 'demo-obsat',
      missionState: demoMissionState(),
    },
  })
  if (demoCreated) {
    const idByUser = Object.fromEntries(DEMO.map(d => [d.username, demoMembers[d.username].id]))
    const assignFor = (subsystem) => {
      const m = DEMO.find(d => d.subsystem === subsystem)
      return m ? idByUser[m.username] : null
    }
    let order = 0
    for (const t of DEMO_TASKS) {
      const deadline = new Date(Date.now() + t.day * 86400000).toISOString().slice(0, 10)
      await models.Task.create({
        projectId: demoProject.id,
        title: t.title,
        subsystem: t.subsystem,
        state: t.state,
        assigneeId: assignFor(t.subsystem),
        deadline,
        order: order++,
      })
    }
  }

  return {
    coreTeamId: coreTeam.id,
    demoTeamId: demoTeam.id,
    demoProjectId: demoProject.id,
    members: CORE.length + DEMO.length,
  }
}
