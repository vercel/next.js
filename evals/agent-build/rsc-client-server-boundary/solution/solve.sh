#!/bin/bash
set -euo pipefail

cat > app/lib/team-catalog.ts <<'EOF'
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
EOF

cat > app/lib/team-directory.ts <<'EOF'
import 'server-only'

import { createHmac } from 'node:crypto'
import { getTeam } from './team-catalog'

export { getTeam }

export function signTeamAccess(teamId: string): string {
  const secret = process.env.TEAM_SIGNING_SECRET
  if (!secret) {
    throw new Error('TEAM_SIGNING_SECRET is required')
  }

  return createHmac('sha256', secret).update(teamId).digest('hex')
}
EOF

cat > app/teams/page.tsx <<'EOF'
import { teamDirectory } from '../lib/team-catalog'
import { TeamPicker } from './team-picker'

export default function TeamsPage() {
  return (
    <main>
      <h1>Team directory</h1>
      <p data-testid="team-count">{teamDirectory.length} active teams</p>
      <TeamPicker teams={teamDirectory} />
    </main>
  )
}
EOF

cat > app/teams/team-picker.tsx <<'EOF'
'use client'

import { useState } from 'react'
import type { Team } from '../lib/team-catalog'

export function TeamPicker({ teams }: { teams: Team[] }) {
  const [selectedId, setSelectedId] = useState(teams[0].id)
  const selected = teams.find((team) => team.id === selectedId)!

  return (
    <section aria-label="Team picker">
      <label>
        Team
        <select
          aria-label="Team"
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
        >
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </label>
      <p data-testid="selected-team">
        {selected.name} uses the {selected.plan} plan.
      </p>
    </section>
  )
}
EOF

npm run typecheck
