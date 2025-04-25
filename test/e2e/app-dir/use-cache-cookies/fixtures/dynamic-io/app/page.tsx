import { cookies } from 'next/headers'
import { setTimeout } from 'timers/promises'

export default async function Page() {
  'use cache'

  console.log(new Date().toISOString(), 'render Page')
  await setTimeout(2000)
  console.log(new Date().toISOString(), 'awaited timeout in Page')
  const loggedIn = (await cookies()).get('isLoggedIn')

  return (
    <>
      <p id="cached-in-page">Page: {new Date().toISOString()}</p>
      <p id="login-status">{loggedIn ? 'logged in' : 'logged out'}</p>
    </>
  )
}
