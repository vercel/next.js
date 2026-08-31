import { MemberList } from './MemberList'
import { getStats } from './members'
import { Stats } from './stats'

export default async function Page() {
  const stats = await getStats()

  return (
    <main>
      <header>
        <h1>Team directory</h1>
        <Stats people={stats.people} teams={stats.teams} />
      </header>
      <MemberList />
    </main>
  )
}
