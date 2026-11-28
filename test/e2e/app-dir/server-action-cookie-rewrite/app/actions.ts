'use server'

import { cookies } from 'next/headers'

export async function logIn() {
  const cookieStore = await cookies()
  cookieStore.set('isLoggedIn', '1')
}
