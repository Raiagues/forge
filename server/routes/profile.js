// Shared profile shaping — a member plus their team memberships (role +
// assigned subsystem). Used by the auth routes and broadcast on presence.
import { models } from '../db/index.js'

export async function profileFor(member) {
  const memberships = await models.TeamMember.findAll({
    where: { memberId: member.id },
    include: [{ model: models.Team }],
  })
  const teams = memberships.map(tm => ({
    teamId: tm.teamId,
    name: tm.team?.name || '',
    institution: tm.team?.institution || '',
    isDemo: !!tm.team?.isDemo,
    role: tm.role,
    subsystem: tm.subsystem,
    isOwner: tm.team?.ownerId === member.id,
  }))
  return {
    id: member.id,
    username: member.username,
    name: member.name,
    email: member.email,
    isAdmin: !!member.isAdmin,
    isDemo: !!member.isDemo,
    teams,
  }
}
