import { headers } from 'next/headers'

export default async function AdminPage() {
  const requestHeaders = await headers()
  const operator = requestHeaders.get('x-operator') ?? 'unknown'
  return (
    <main>
      <h1>Admin</h1>
      <p id="operator">Signed in as {operator}</p>
      <p>Live per-user controls render here.</p>
    </main>
  )
}
