import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const cookieStore = cookies()
  const token = cookieStore.get('token')?.value ?? 'default'

  return new Response('hello world', {
    status: 200,
    headers: { 'Set-Cookie': `token=${token}` },
  })
}
