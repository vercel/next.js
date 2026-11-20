import { headers } from 'next/headers'

export async function GET() {
  const headerStore = await headers()
  return Response.json(headerStore.get('host'))
}
