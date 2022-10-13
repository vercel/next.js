import { cookies } from 'next/headers'

export default function Page() {
  const cookiesList = cookies()
  const cookie = cookiesList.get('use-cookies')

  const hasCookie = cookie === 'value'

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
