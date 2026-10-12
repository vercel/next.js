import { viewer } from '../lib/viewer'

export default async function Page() {
  const member = await viewer()
  return (
    <main>
      <h1>Member dashboard</h1>
      <p id="member">{member.name}</p>
      <p id="language">{member.language}</p>
    </main>
  )
}
