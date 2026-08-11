import { Suspense } from 'react'
import { LinkAccordion } from '../../../components/link-accordion'

async function Followers({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params
  const users = Array.from({ length: 10 }, (_, i) => `user${i}`)
  return (
    <section>
      <h2 id="followers-heading">Followers of {username}</h2>
      <ul>
        {users.map((u) => (
          <li key={u}>
            <LinkAccordion href={`/${u}`}>{u}</LinkAccordion>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function FollowersPage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  return (
    <Suspense fallback={null}>
      <Followers params={params} />
    </Suspense>
  )
}
