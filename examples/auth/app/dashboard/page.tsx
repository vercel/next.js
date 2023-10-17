import { auth } from '@/auth'

export default async function Page() {
  const session = await auth()
  return (
    <section>
      <h1>Dashboard</h1>
      <p>Welcome {session?.user?.name}</p>
    </section>
  )
}
