'use server'

import { cookies } from 'next/headers'

export async function cookieAction() {
  const cookieStore = await cookies()
  cookieStore.set('common-cookie', 'from-action')
}
