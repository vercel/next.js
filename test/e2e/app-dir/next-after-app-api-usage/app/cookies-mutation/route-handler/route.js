import { cookies } from 'next/headers'
import { after } from 'next/server'

export async function GET() {
  const path = '/cookies-mutation/route-handler'

  const cookieStore = await cookies()
  cookieStore.set('test-cookie', 'mutated')

  after(async () => {
    const value = (await cookies()).get('test-cookie')?.value
    console.log(`[${path}] cookies() in after(): test-cookie=${value}`)
  })

  return new Response()
}
