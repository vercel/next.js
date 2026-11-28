import { cookies } from 'next/headers'

export async function GET(request) {
  const cookieStore = await cookies()

  return Response.json({
    cookie1: cookieStore.get('rsc-cookie-value-1')?.value,
    cookie2: cookieStore.get('rsc-cookie-value-2')?.value,
    otherCookie: cookieStore.get('other-cookie')?.value,
    cookieCount: cookieStore.getAll().length,
    requestCookieHeader: request.headers.get('cookie'),
  })
}
