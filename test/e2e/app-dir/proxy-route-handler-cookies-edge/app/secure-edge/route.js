import { cookies } from 'next/headers'
import { connection } from 'next/server'

export const runtime = 'edge'

export async function GET() {
  await connection()
  // `maxAge` gives a new `Expires` when the cookie is serialized again. Wait
  // past the second that the proxy serialized it in.
  await new Promise((resolve) => setTimeout(resolve, 1100))
  const jar = await cookies()
  return Response.json({ session: jar.get('session')?.value })
}
