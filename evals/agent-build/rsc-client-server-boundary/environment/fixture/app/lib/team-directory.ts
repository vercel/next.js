import 'server-only'

import { createHmac } from 'node:crypto'

export type Team = {
  id: string
  name: string
  plan: 'enterprise' | 'pro'
}

export const teamDirectory: Team[] = [
  { id: 'acme', name: 'Acme', plan: 'enterprise' },
  { id: 'northstar', name: 'Northstar', plan: 'pro' },
  { id: 'orbit', name: 'Orbit', plan: 'enterprise' },
]

export function getTeam(teamId: string): Team | undefined {
  return teamDirectory.find((team) => team.id === teamId)
}

export function signTeamAccess(teamId: string): string {
  const secret = process.env.TEAM_SIGNING_SECRET
  if (!secret) {
    throw new Error('TEAM_SIGNING_SECRET is required')
  }

  return createHmac('sha256', secret).update(teamId).digest('hex')
}
