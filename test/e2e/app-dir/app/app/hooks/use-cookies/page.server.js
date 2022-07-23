import { useCookies } from 'next/dist/client/components/hooks-server'

export default function Page() {
  const cookies = useCookies()

  const hasCookie =
    'use-cookies' in cookies && cookies['use-cookies'] === 'value'

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
