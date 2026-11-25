import { cookies, headers } from 'next/headers'

export async function viewer() {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()])
  return {
    name: cookieStore.get('member')?.value || 'Guest',
    language: headerStore.get('accept-language') || 'en',
  }
}
