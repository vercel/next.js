import { unstable_after as after } from 'next/server'
import { setTimeout } from 'timers/promises'

export const dynamic = 'error'

export async function GET() {
  after(async () => {
    await setTimeout(500)
    throw new Error('Error thrown from unstable_after: /route-throws-in-after')
  })
  return new Response()
}
