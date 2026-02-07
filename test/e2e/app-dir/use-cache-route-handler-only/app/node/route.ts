import { setTimeout } from 'timers/promises'

async function getCachedDate() {
  'use cache'

  // Simulate I/O latency.
  await setTimeout(200)

  return new Date().toISOString()
}

export async function GET() {
  const date1 = await getCachedDate()
  const date2 = await getCachedDate()

  const response = JSON.stringify({ date1, date2 })

  return new Response(response, {
    headers: { 'content-type': 'application/json' },
  })
}
