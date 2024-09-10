'use server'

import { cookies } from 'next/headers'

export async function cookieAction() {
  const cookieStore = cookies()
  cookieStore.set('common-cookie', 'from-action')
}
