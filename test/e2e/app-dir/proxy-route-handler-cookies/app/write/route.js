import { cookies } from 'next/headers'

export async function GET() {
  const jar = await cookies()
  jar.set('from-route', 'yes', { path: '/' })
  return Response.json({
    cookies: jar
      .getAll()
      .map((cookie) => cookie.name + '=' + cookie.value)
      .join(','),
  })
}
