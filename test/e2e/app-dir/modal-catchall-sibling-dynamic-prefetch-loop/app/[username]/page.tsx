import { Suspense } from 'react'

async function Profile({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  return (
    <section>
      <h2 id="profile-heading">Profile of {username}</h2>
    </section>
  )
}

export default function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  return (
    <Suspense fallback={null}>
      <Profile params={params} />
    </Suspense>
  )
}
