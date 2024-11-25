import { unstable_after as after } from 'next/server'
import { setTimeout } from 'timers/promises'

export const dynamic = 'error'

export async function GET() {
  const promise = (async () => {
    await setTimeout(500)
    throw new Error(
      'My cool error thrown inside unstable_after on route "/route-throws-in-after/promise"'
    )
  })()
  after(promise)
  return new Response()
}
