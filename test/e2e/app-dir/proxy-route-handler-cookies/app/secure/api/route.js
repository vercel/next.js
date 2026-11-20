import { setTimeout } from 'timers/promises'
import { connection } from 'next/server'
import { cookies } from 'next/headers'

export async function GET() {
  await connection()
  // `maxAge` gives a new `Expires` when the cookie is serialized again. Wait
  // past the second that the proxy serialized it in.
  await setTimeout(1100)
  const jar = await cookies()
  return Response.json({
    cookies: jar
      .getAll()
      .map((cookie) => cookie.name + '=' + cookie.value)
      .join(','),
  })
}
