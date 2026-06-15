// ──────────────────────────────────────────────────────────────────
// Unified GuiaSat database (deferred backend pass, IMPLEMENTATION_PLAN §3/§4).
//
// Sequelize + SQLite — the single store behind auth, teams, projects,
// tasks, autonomy events, shared mission state and phase reports. Adopted
// from the login_project service and extended with the multi-project /
// collaboration schema; the flash/serial/analytics routes fold into the
// same process (server/index.js).
//
// SQLite (sqlite3) is an OPTIONAL dependency so the GitHub Pages build
// (frontend-only) never fails on a native build. If the driver is absent
// the server still boots and serves the device/analytics routes; only the
// DB-backed routes report 503. `initDb()` returns the live sequelize
// instance or null.
// ──────────────────────────────────────────────────────────────────
import { Sequelize, DataTypes } from 'sequelize'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'

const HERE = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(HERE, '..', 'data')
const STORAGE = process.env.FORGE_DB || join(DATA_DIR, 'guiasat.sqlite')

export const models = {}
export let sequelize = null

// JSON columns stored as TEXT (portable across sqlite) with safe parse.
const json = (name, def = null) => ({
  type: DataTypes.TEXT,
  allowNull: true,
  get() {
    const raw = this.getDataValue(name)
    if (raw == null) return def
    try { return JSON.parse(raw) } catch { return def }
  },
  set(v) { this.setDataValue(name, v == null ? null : JSON.stringify(v)) },
})

function define(seq) {
  // ── members (user accounts) ──────────────────────────────────────
  models.Member = seq.define('member', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    username: { type: DataTypes.STRING, allowNull: false, unique: true },
    passhash: { type: DataTypes.STRING, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false, defaultValue: '' },
    email: { type: DataTypes.STRING, allowNull: true },
    isAdmin: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    isDemo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  }, { timestamps: true })

  // ── teams ────────────────────────────────────────────────────────
  models.Team = seq.define('team', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    institution: { type: DataTypes.STRING, allowNull: true },
    ownerId: { type: DataTypes.INTEGER, allowNull: false },
    isDemo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  }, { timestamps: true })

  // ── team membership (role + assigned subsystem) ──────────────────
  models.TeamMember = seq.define('team_member', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    teamId: { type: DataTypes.INTEGER, allowNull: false },
    memberId: { type: DataTypes.INTEGER, allowNull: false },
    role: { type: DataTypes.ENUM('manager', 'member'), allowNull: false, defaultValue: 'member' },
    subsystem: { type: DataTypes.STRING, allowNull: true },
  }, {
    timestamps: true,
    indexes: [{ unique: true, fields: ['teamId', 'memberId'] }],
  })

  // ── projects (multi-project: each owns a mission-state snapshot) ──
  models.Project = seq.define('project', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    teamId: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false, defaultValue: 'Missão' },
    shareToken: { type: DataTypes.STRING, allowNull: true, unique: true },
    isDemo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // the shared design blob: { missionPlan, entities, wires, phaseState, schedule, hwtest }
    missionState: json('missionState', {}),
  }, { timestamps: true })

  // ── tasks (kanban + deadlines) ───────────────────────────────────
  models.Task = seq.define('task', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    projectId: { type: DataTypes.INTEGER, allowNull: false },
    title: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    state: { type: DataTypes.ENUM('backlog', 'doing', 'review', 'done'), allowNull: false, defaultValue: 'backlog' },
    subsystem: { type: DataTypes.STRING, allowNull: true },
    assigneeId: { type: DataTypes.INTEGER, allowNull: true },
    deadline: { type: DataTypes.DATEONLY, allowNull: true },
    order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  }, { timestamps: true })

  // ── autonomy instrumentation events ──────────────────────────────
  models.Event = seq.define('event', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    sessionId: { type: DataTypes.STRING, allowNull: true },
    memberId: { type: DataTypes.INTEGER, allowNull: true },
    projectId: { type: DataTypes.INTEGER, allowNull: true },
    teamId: { type: DataTypes.INTEGER, allowNull: true },
    name: { type: DataTypes.STRING, allowNull: false },
    payload: json('payload', {}),
    at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, { timestamps: false })

  // ── backend-stored phase reports (A7) ────────────────────────────
  models.PhaseReport = seq.define('phase_report', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    projectId: { type: DataTypes.INTEGER, allowNull: false },
    phaseId: { type: DataTypes.STRING, allowNull: false },
    authorId: { type: DataTypes.INTEGER, allowNull: true },
    authorName: { type: DataTypes.STRING, allowNull: true },
    summary: { type: DataTypes.TEXT, allowNull: true },
    criteria: json('criteria', []),
    confirmedAt: { type: DataTypes.DATE, allowNull: true },
  }, { timestamps: true })

  // ── associations ─────────────────────────────────────────────────
  models.Team.hasMany(models.TeamMember, { foreignKey: 'teamId', onDelete: 'CASCADE' })
  models.TeamMember.belongsTo(models.Team, { foreignKey: 'teamId' })
  models.TeamMember.belongsTo(models.Member, { foreignKey: 'memberId' })
  models.Member.hasMany(models.TeamMember, { foreignKey: 'memberId' })
  models.Team.hasMany(models.Project, { foreignKey: 'teamId', onDelete: 'CASCADE' })
  models.Project.belongsTo(models.Team, { foreignKey: 'teamId' })
  models.Project.hasMany(models.Task, { foreignKey: 'projectId', onDelete: 'CASCADE' })
  models.Task.belongsTo(models.Project, { foreignKey: 'projectId' })
  models.Project.hasMany(models.PhaseReport, { foreignKey: 'projectId', onDelete: 'CASCADE' })
  models.PhaseReport.belongsTo(models.Project, { foreignKey: 'projectId' })
}

// Boot the DB: construct sequelize, define models, sync schema. Returns
// the instance, or null if the sqlite driver is unavailable (the server
// then runs in device-only mode).
export async function initDb() {
  if (sequelize) return sequelize
  try {
    mkdirSync(DATA_DIR, { recursive: true })
    const seq = new Sequelize({
      dialect: 'sqlite',
      storage: STORAGE,
      logging: false,
    })
    define(seq)
    await seq.authenticate()
    await seq.sync()
    sequelize = seq
    return seq
  } catch (e) {
    console.warn(`[forge] database unavailable (${e.message}) — running device-only. Install the optional 'sqlite3' dependency to enable auth/teams/projects.`)
    return null
  }
}

export const dbReady = () => !!sequelize
