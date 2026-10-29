import { connection } from 'next/server'

// Request-time data outside any Suspense boundary: an empty (blocking) shell,
// which must still resume on the server.
export const instant = false

export default async function Page() {
  await connection()
  return <p id="dynamic">Blocking: {Date.now()}</p>
}
