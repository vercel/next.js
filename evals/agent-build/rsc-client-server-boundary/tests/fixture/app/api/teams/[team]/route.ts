import { getTeam, signTeamAccess } from '../../../lib/team-directory'

export async function GET(
  _request: Request,
  { params }: RouteContext<'/api/teams/[team]'>
) {
  const { team: teamId } = await params
  const team = getTeam(teamId)

  if (!team) {
    return Response.json({ error: 'Team not found' }, { status: 404 })
  }

  return Response.json({
    team,
    signature: signTeamAccess(team.id),
  })
}
