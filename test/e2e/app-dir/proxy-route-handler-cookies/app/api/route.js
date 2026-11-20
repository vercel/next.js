import { cookies } from 'next/headers'

export async function GET() {
  const jar = await cookies()
  return Response.json({
    cookies: jar
      .getAll()
      .map((cookie) => cookie.name + '=' + cookie.value)
      .join(','),
  })
}
