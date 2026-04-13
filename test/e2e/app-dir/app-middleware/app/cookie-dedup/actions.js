'use server'

import { cookies } from 'next/headers'

export async function setCookieAction() {
  const c = await cookies()
  c.set('shared-cookie', 'from-action')
  c.set('action-only-cookie', 'action-value')
}
