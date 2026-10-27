import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE } from '@/lib/session'

// Local testing helper: /login/as?user=ada
export async function GET(request: Request) {
  const user = new URL(request.url).searchParams.get('user') ?? 'ada'
  const store = await cookies()
  store.set(SESSION_COOKIE, `tok_${user}`, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
  })
  redirect('/app')
}
