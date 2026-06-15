// ──────────────────────────────────────────────────────────────────
// Role / permission model (IMPLEMENTATION_PLAN §3). PURE — no store/UI
// imports. Mirrors the server-side enforcement so the UI can gate edits
// before a request is made:
//   • manager — full edit: team config, mission, hardware, all tasks.
//   • member  — read-all; edit only their assigned subsystem + own tasks.
// The server is always the source of truth; this is UI gating only.
// ──────────────────────────────────────────────────────────────────

export const ROLES = { MANAGER: 'manager', MEMBER: 'member' }

// Canonical subsystems a member can be assigned to. Matches SEED_ACCOUNTS
// and the build phases.
export const SUBSYSTEMS = ['Hardware', 'Firmware', 'Testing', 'Documentation & requirements', 'team lead']

// Map a workspace section / build phase to the subsystem that owns it, so
// a member's edit rights follow them through the pipeline.
const SECTION_SUBSYSTEM = {
  hardware: 'Hardware',
  serialtest: 'Firmware',
  firmware: 'Firmware',
  hwtest: 'Testing',
  testing: 'Testing',
}
const PHASE_SUBSYSTEM = {
  hardware: 'Hardware',
  firmware: 'Firmware',
  testing: 'Testing',
  mission: 'Documentation & requirements',
}

export const subsystemForSection = (section) => SECTION_SUBSYSTEM[section] || null
export const subsystemForPhase = (phaseId) => PHASE_SUBSYSTEM[phaseId] || null

export const isManager = (role) => role === ROLES.MANAGER

// can this caller manage team membership / config?
export const canManageTeam = (role) => isManager(role)

// can this caller edit the shared mission plan / hardware design?
// managers always; members never edit the shared mission (read-only),
// they contribute through their subsystem's tasks + scoped work.
export const canEditMission = (role) => isManager(role)

// can this caller edit work for a given subsystem?
export function canEditSubsystem(role, ownSubsystem, targetSubsystem) {
  if (isManager(role)) return true
  if (!targetSubsystem) return false
  return ownSubsystem === targetSubsystem
}

// can this caller edit a given task? managers any; members their own
// assignment or their subsystem's tasks.
export function canEditTask(role, member, task) {
  if (isManager(role)) return true
  if (!task) return false
  if (task.assigneeId && member?.id === task.assigneeId) return true
  return !!member?.subsystem && member.subsystem === task.subsystem
}

export function describeRole(role) {
  return isManager(role)
    ? 'Gestor — edita missão, equipe e todas as tarefas'
    : 'Membro — edita apenas o subsistema atribuído e suas tarefas'
}
