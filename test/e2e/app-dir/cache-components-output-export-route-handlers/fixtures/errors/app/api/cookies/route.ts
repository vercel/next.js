import { cookies } from 'next/headers'

export async function GET() {
  return Response.json({ cookie: (await cookies()).get('example') })
}
