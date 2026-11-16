'use server'
import { cookies, headers } from 'next/headers'

export async function invoke(form: FormData) {
  const nonce = String(form.get('nonce'))
  const requestHeaders = await headers()
  const result = {
    nonce,
    host: requestHeaders.get('host'),
    forwardedHost: requestHeaders.get('x-forwarded-host'),
  }
  ;(await cookies()).set('origin-result', JSON.stringify(result), {
    httpOnly: true,
    path: '/',
  })
}
