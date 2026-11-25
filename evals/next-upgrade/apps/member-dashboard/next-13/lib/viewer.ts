import { cookies, headers } from 'next/headers'

export function viewer() {
  const cookieStore = cookies()
  const headerStore = headers()
  return {
    name: cookieStore.get('member')?.value || 'Guest',
    language: headerStore.get('accept-language') || 'en',
  }
}
