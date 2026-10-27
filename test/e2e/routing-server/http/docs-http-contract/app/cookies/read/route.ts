import { cookies } from 'next/headers'

export async function GET() {
  const jar = await cookies()
  return Response.json({
    first: jar.get('first')?.value,
    second: jar.get('second')?.value,
  })
}
