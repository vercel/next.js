import { cookies } from 'next/headers'

export default function Page() {
  const cookiesList = cookies()
  const hasCookie = cookiesList.has('use-cookies')

  return (
    <>
      <h1 id="text">hello from /hooks/use-cookies</h1>
      {hasCookie ? (
        <h2 id="has-cookie">Has use-cookies cookie</h2>
      ) : (
        <h2 id="does-not-have-cookie">Does not have use-cookies cookie</h2>
      )}
    </>
  )
}
