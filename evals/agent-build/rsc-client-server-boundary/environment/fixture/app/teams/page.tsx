import { teamDirectory } from '../lib/team-directory'
import { TeamPicker } from './team-picker'

export default function TeamsPage() {
  return (
    <main>
      <h1>Team directory</h1>
      <p data-testid="team-count">{teamDirectory.length} active teams</p>
      <TeamPicker />
    </main>
  )
}
