'use server'

import { cookies } from 'next/headers'

export async function updateCookie() {
  const cookieStore = await cookies()
  cookieStore.set('query-test', 'set')
}
