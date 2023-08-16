import { cookies, headers } from 'next/headers'

export default function Layout({ children }) {
  const curHeaders = headers()
  const curCookies = cookies()

  return (
    <>
      <p id="headers">{JSON.stringify([...curHeaders.keys()])}</p>
      <p id="cookies">{JSON.stringify([...curCookies.getAll()])}</p>
      {children}
    </>
  )
}
