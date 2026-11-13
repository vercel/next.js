import { headers } from 'next/headers'
import { setTimeout } from 'node:timers/promises'

export async function GET() {
  headers()
  await setTimeout(20)
  return Response.json({
    message: 'Uncached IO with an unused request promise',
  })
}
