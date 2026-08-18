'use server'

import { cookies } from 'next/headers'

export async function recordSubmission() {
  const cookieStore = await cookies()
  cookieStore.set('submitted', 'yes')
}
