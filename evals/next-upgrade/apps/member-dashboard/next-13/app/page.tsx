import { viewer } from '../lib/viewer'

export default function Page() {
  const member = viewer()
  return (
    <main>
      <h1>Member dashboard</h1>
      <p id="member">{member.name}</p>
      <p id="language">{member.language}</p>
    </main>
  )
}
