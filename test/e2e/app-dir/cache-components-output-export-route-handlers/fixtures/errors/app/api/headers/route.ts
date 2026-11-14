import { headers } from 'next/headers'

export async function GET() {
  return Response.json({ agent: (await headers()).get('user-agent') })
}
