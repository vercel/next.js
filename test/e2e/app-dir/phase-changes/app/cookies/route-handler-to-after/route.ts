import { cookies } from 'next/headers'
import { unstable_after as after } from 'next/server'

export async function POST() {
  after(async () => {
    const cookieStore = await cookies()
    cookieStore.set('illegalCookie', 'too-late-for-that')
  })

  return new Response('')
}
