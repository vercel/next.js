'use server'

import { cookies } from 'next/headers'

export async function log() {
  console.log('action invoked')
  const cookieStore = await cookies()
  cookieStore.set('log-action-invoked', '1')
  return 'hi'
}
