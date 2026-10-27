import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { CUSTOMER_COOKIE } from '@/lib/customers'

// Local testing helper: /account/sign-in?as=ada
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('as') ?? 'ada'
  const store = await cookies()
  store.set(CUSTOMER_COOKIE, id, { path: '/', httpOnly: true, sameSite: 'lax' })
  redirect('/account')
}
