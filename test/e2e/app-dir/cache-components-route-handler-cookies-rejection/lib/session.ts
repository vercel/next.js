import { cookies } from 'next/headers'

export async function getSession() {
  try {
    const cookieStore = await cookies()

    return cookieStore.get('session')?.value ?? null
  } catch (error) {
    // A common "optional session" pattern: the helper swallows cookie access
    // failures and logs them as application errors.
    console.error('[getSession] failed to read cookies', error)

    return null
  }
}
