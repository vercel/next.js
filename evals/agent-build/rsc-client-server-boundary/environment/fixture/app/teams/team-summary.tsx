'use client'

import { useState } from 'react'
import { getTeam } from '../lib/team-directory'

export function TeamSummary({ teamId }: { teamId: string }) {
  const [showPlan, setShowPlan] = useState(false)
  const team = getTeam(teamId)

  if (!team) return null

  return (
    <section aria-label="Pinned team">
      <p>Pinned: {team.name}</p>
      <button onClick={() => setShowPlan((value) => !value)}>
        {showPlan ? 'Hide pinned plan' : 'Show pinned plan'}
      </button>
      {showPlan ? <p data-testid="pinned-plan">{team.plan}</p> : null}
    </section>
  )
}
