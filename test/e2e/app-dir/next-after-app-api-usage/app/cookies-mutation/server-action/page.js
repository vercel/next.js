import { cookies } from 'next/headers'
import { after } from 'next/server'

export default async function Page() {
  return (
    <form
      action={async () => {
        'use server'
        const path = '/cookies-mutation/server-action'

        const cookieStore = await cookies()
        cookieStore.set('test-cookie', 'mutated')

        after(async () => {
          const value = (await cookies()).get('test-cookie')?.value
          console.log(`[${path}] cookies() in after(): test-cookie=${value}`)
        })
      }}
    >
      <button type="submit">Submit</button>
    </form>
  )
}
