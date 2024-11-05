import { cookies } from 'next/headers'
import { unstable_rethrow } from 'next/navigation'

export default async function Page() {
  try {
    await cookies()
  } catch (err) {
    console.log('[test assertion]: checking error')
    unstable_rethrow(err)
    console.error('[test assertion]: error leaked', err)
  }

  return <p>hello world</p>
}
