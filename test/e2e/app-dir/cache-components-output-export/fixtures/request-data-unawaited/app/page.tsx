import { cookies, headers } from 'next/headers'

export default async function Page() {
  // Created but never read: no request data flows into the render.
  cookies()
  headers()
  return <p>fully static</p>
}
