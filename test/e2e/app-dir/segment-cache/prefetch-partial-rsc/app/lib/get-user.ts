import { cookies } from 'next/headers'

export async function getUser(): Promise<{ name: string }> {
  const cookieStore = await cookies()
  const userCookie = cookieStore.get('user')

  if (!userCookie) {
    return { name: 'Guest' }
  }

  return { name: userCookie.value }
}
