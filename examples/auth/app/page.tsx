import Link from 'next/link'
import SignIn from './sign-in'

export default function Page() {
  return (
    <section>
      <h1>Home</h1>
      <p>This page does not have authentication</p>
      <Link href="/dashboard">View dashboard</Link>
      <SignIn />
    </section>
  )
}
