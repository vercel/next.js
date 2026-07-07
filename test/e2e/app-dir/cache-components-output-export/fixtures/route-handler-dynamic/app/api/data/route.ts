import { cookies } from 'next/headers'

export async function GET() {
  const store = await cookies()
  return Response.json({ token: store.get('token')?.value ?? null })
}
