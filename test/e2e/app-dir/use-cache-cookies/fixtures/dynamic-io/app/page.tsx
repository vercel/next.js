import { cookies } from 'next/headers'
import { setTimeout } from 'timers/promises'

export default async function Page() {
  'use cache'

  await setTimeout(1000)
  const loggedIn = (await cookies()).get('isLoggedIn')

  return <p id="login-status">{loggedIn ? 'logged in' : 'logged out'}</p>
}
