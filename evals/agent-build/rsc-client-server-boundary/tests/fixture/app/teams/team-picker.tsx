'use client'

import { useState } from 'react'
import { teamDirectory } from '../lib/team-directory'

export function TeamPicker() {
  const [selectedId, setSelectedId] = useState(teamDirectory[0].id)
  const selected = teamDirectory.find((team) => team.id === selectedId)!

  return (
    <section aria-label="Team picker">
      <label>
        Team
        <select
          aria-label="Team"
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
        >
          {teamDirectory.map((team) => (
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
