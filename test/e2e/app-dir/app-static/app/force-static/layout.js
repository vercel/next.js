import { cookies, headers } from 'next/headers'

export default async function Layout({ children }) {
  const curHeaders = await headers()
  const curCookies = await cookies()

  return (
    <>
      <p id="headers">{JSON.stringify([...curHeaders.keys()])}</p>
      <p id="cookies">{JSON.stringify([...curCookies.getAll()])}</p>
      {children}
    </>
  )
}
