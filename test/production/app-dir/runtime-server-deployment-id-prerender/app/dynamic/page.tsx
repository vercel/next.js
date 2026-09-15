import { headers } from 'next/headers'

export default async function Page() {
  // Force a dynamic RSC response so navigation hits the running server.
  await headers()
  return <p id="dynamic">dynamic page</p>
}
