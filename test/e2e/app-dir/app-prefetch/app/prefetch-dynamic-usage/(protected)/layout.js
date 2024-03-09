import { cookies } from 'next/headers'
import { Redirect } from './redirect'

async function isLoggedIn() {
  // sleep for 1s
  await new Promise((resolve) => setTimeout(resolve, 1000))

  const cookieData = cookies()
  const hasSession = !!cookieData.get('logged-in')

  return hasSession
}

export default async function Layout({ children }) {
  const loggedIn = await isLoggedIn()
  console.log({ loggedIn })

  if (!loggedIn) return <Redirect />

  return <div>Protected Layout: {children}</div>
}
