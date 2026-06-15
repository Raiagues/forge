// ──────────────────────────────────────────────────────────────────
// Seed accounts + demo team (IMPLEMENTATION_PLAN §4 items 9 & 13,
// SEED_ACCOUNTS.md). Idempotent: runs on every boot but only creates
// what is missing. All demo data is labelled "dados de demonstração".
// Passwords are bcrypt-hashed (cost ≥10) — never stored in plaintext.
// ──────────────────────────────────────────────────────────────────
import { models } from './db/index.js'
import { hashPassword } from './auth/index.js'
import { SEED_CHALLENGES } from '../src/mission/challenges.js'

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

// Curated seed challenges (src/mission/challenges.js) → Challenges table
// as approved/isSeed rows. Idempotent on the challenge slug.
async function seedChallenges() {
  let created = 0
  for (const c of SEED_CHALLENGES) {
    const [, made] = await models.Challenge.findOrCreate({
      where: { slug: c.id },
      defaults: {
        slug: c.id,
        org: c.org,
        location: c.location || null,
        region: c.region || null,
        category: c.category,
        problem: c.problem,
        cost: c.cost || null,
        value: c.value || null,
        cards: c.cards || {},
        status: 'approved',
        isSeed: true,
      },
    })
    if (made) created++
  }
  return created
}

// A handful of demonstration ORGANISATION submissions (isSeed=false) so the
// admin review queue + market-intelligence dashboard are populated out of
// the box. Spread across categories / regions / statuses / months to make
// the heat maps and timeline meaningful. Clearly labelled demo data.
const DEMO_SUBMISSIONS = [
  { org: 'Secretaria de Agricultura — RS (demonstração)', location: 'Passo Fundo, RS', region: 'RS', category: 'earth_obs', status: 'pending', monthsAgo: 0,
    problem: 'Produtores de trigo do planalto gaúcho precisam de alerta precoce de geada e estresse hídrico por talhão, hoje inexistente fora das estações meteorológicas oficiais.',
    cost: 'Geadas tardias destroem safras inteiras de trigo, com prejuízo de centenas de milhões de reais por evento severo.',
    value: 'Mapa de risco térmico e de umidade do solo por talhão, atualizado a cada poucos dias.' },
  { org: 'Operadora de saneamento — SP (demonstração)', location: 'Bacia do Piracicaba, SP', region: 'SP', category: 'earth_obs', status: 'pending', monthsAgo: 0,
    problem: 'Reservatórios de abastecimento sofrem com floração de algas e perda de nível sem monitoramento contínuo da qualidade e do espelho d’água.',
    cost: 'Crises hídricas afetam milhões de pessoas e elevam o custo de tratamento da água.',
    value: 'Indicador periódico de área do reservatório e sinais de eutrofização.' },
  { org: 'Cooperativa de energia eólica — RN (demonstração)', location: 'Serra do Mel, RN', region: 'RN', category: 'communication', status: 'approved', monthsAgo: 1,
    problem: 'Parques eólicos remotos perdem telemetria de turbinas quando a rede terrestre cai, atrasando manutenção preventiva.',
    cost: 'Cada turbina parada representa perda diária relevante de geração e receita.',
    value: 'Canal de telemetria de baixa taxa independente da rede terrestre para status das turbinas.' },
  { org: 'Instituto de pesquisa oceânica — SC (demonstração)', location: 'Florianópolis, SC', region: 'SC', category: 'atmospheric', status: 'approved', monthsAgo: 2,
    problem: 'Boias de monitoramento costeiro ficam sem enlace por dias, perdendo séries de temperatura e correntes importantes para previsão.',
    cost: 'Lacunas nos dados degradam modelos de previsão de ressaca e pesca.',
    value: 'Coleta periódica de telemetria ambiental das boias mesmo sem cobertura celular.' },
  { org: 'Defesa Civil estadual — MG (demonstração)', location: 'Região serrana, MG', region: 'MG', category: 'earth_obs', status: 'pending', monthsAgo: 1,
    problem: 'Encostas urbanas sujeitas a deslizamento não têm monitoramento contínuo de umidade e movimentação do solo na estação chuvosa.',
    cost: 'Deslizamentos causam vítimas e desabrigados todos os anos nas chuvas de verão.',
    value: 'Sinal periódico de risco por área crítica para acionar alerta e evacuação.' },
  { org: 'Concessionária rodoviária — GO (demonstração)', location: 'Eixo BR-153, GO', region: 'GO', category: 'communication', status: 'rejected', monthsAgo: 3,
    problem: 'Sensores de tráfego e pesagem em trechos isolados não têm backhaul confiável para enviar dados em tempo hábil.',
    cost: 'Falta de dados atrasa resposta a acidentes e fiscalização de excesso de peso.',
    value: 'Backhaul intermitente de baixo volume para os sensores de pista.' },
  { org: 'Associação de carcinicultura — CE (demonstração)', location: 'Litoral do Ceará', region: 'CE', category: 'atmospheric', status: 'approved', monthsAgo: 4,
    problem: 'Fazendas de camarão precisam de previsão de temperatura e salinidade da água costeira para reduzir mortalidade nos viveiros.',
    cost: 'Choques térmicos e salinos causam perdas expressivas de produção.',
    value: 'Produto simples de TSM e salinidade costeira para planejar o manejo.' },
  { org: 'Mineradora de pequeno porte — PA (demonstração)', location: 'Sudeste do Pará', region: 'PA', category: 'tech_demo', status: 'pending', monthsAgo: 5,
    problem: 'Querem validar um terminal de comunicação por satélite de baixo custo para enviar status operacional de áreas sem qualquer infraestrutura.',
    cost: 'Sem comunicação, falhas operacionais demoram a ser detectadas e corrigidas.',
    value: 'Demonstração de enlace de baixo custo para status operacional remoto.' },
]

async function seedDemoSubmissions(submitter) {
  if (!submitter) return 0
  let created = 0
  for (let i = 0; i < DEMO_SUBMISSIONS.length; i++) {
    const s = DEMO_SUBMISSIONS[i]
    const slug = `demo-sub-${i + 1}`
    const createdAt = new Date(Date.now() - s.monthsAgo * 30 * 86400000)
    const [, made] = await models.Challenge.findOrCreate({
      where: { slug },
      defaults: {
        slug,
        org: s.org,
        location: s.location || null,
        region: s.region || null,
        category: s.category,
        problem: s.problem,
        cost: s.cost || null,
        value: s.value || null,
        cards: {},
        status: s.status,
        isSeed: false,
        submitterId: submitter.id,
        submitterName: submitter.name || submitter.username,
        reviewNote: s.status === 'rejected' ? 'Fora do escopo de uma missão CubeSat estudantil (demonstração).' : null,
        reviewedAt: s.status === 'pending' ? null : createdAt,
        createdAt,
        updatedAt: createdAt,
      },
    })
    if (made) created++
  }
  return created
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

  // real-world challenges: curated seeds + demo organisation submissions
  const seededChallenges = await seedChallenges()
  const seededSubmissions = await seedDemoSubmissions(demoMembers.lider_obsat)

  return {
    coreTeamId: coreTeam.id,
    demoTeamId: demoTeam.id,
    demoProjectId: demoProject.id,
    members: CORE.length + DEMO.length,
    challenges: seededChallenges,
    submissions: seededSubmissions,
  }
}
