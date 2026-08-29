import { SearchDirectory } from './SearchDirectory'
import { searchMembers } from './members'

export default async function Page() {
  const members = await searchMembers('')

  return (
    <main>
      <h1>Team directory</h1>
      <SearchDirectory initialMembers={members} />
    </main>
  )
}
