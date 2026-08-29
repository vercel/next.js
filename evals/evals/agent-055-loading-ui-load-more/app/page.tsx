import { MemberList } from './MemberList'
import { getMembers } from './members'

export default async function Page() {
  const firstPage = await getMembers(1)

  return (
    <main>
      <h1>Team directory</h1>
      <MemberList initialPage={firstPage} />
    </main>
  )
}
