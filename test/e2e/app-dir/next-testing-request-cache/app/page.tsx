import { cookies, headers } from 'next/headers'
import { cache } from 'react'
import { randomUUID } from 'node:crypto'

const requestToken = cache(() => randomUUID())

export default async function Page() {
  const cookieStore = await cookies()
  const headerStore = await headers()
  let cookieMutationRejected = false
  let headerMutationRejected = false
  try {
    cookieStore.set('render-write', 'forbidden')
  } catch {
    cookieMutationRejected = true
  }
  try {
    headerStore.set('content-language', 'forbidden')
  } catch {
    headerMutationRejected = true
  }
  return (
    <pre id="request">
      {JSON.stringify({
        cookie: cookieStore.get('visitor')?.value,
        language: headerStore.get('accept-language'),
        cookieMutationRejected,
        headerMutationRejected,
        tokens: [requestToken(), requestToken()],
      })}
    </pre>
  )
}
