import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const cookieStore = cookies()
  const token = cookieStore.get('token')?.value ?? Math.random()

  return new Response(String(token), {
    status: 200,
    headers: { 'Set-Cookie': `token=${token}` },
  })
}
