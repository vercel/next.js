export const dynamic = 'force-dynamic'

export default async function StatusPage() {
  const requestId = crypto.randomUUID()
  return (
    <main>
      <h1>Diagnostics</h1>
      <p id="request-id">Request: {requestId}</p>
      <p id="time">Server time: {new Date().toISOString()}</p>
    </main>
  )
}
