import { setImmediate } from 'node:timers/promises'

import { getSentinelValue } from '../../getSentinelValue'

export function GET() {
  const encoder = new TextEncoder()
  let sent = 0

  return new Response(
    new ReadableStream({
      async pull(controller) {
        await setImmediate()
        controller.enqueue(encoder.encode(`${getSentinelValue()}:${sent++}\n`))
        if (sent === 3) {
          controller.close()
        }
      },
    }),
    { headers: { 'content-type': 'text/plain', 'x-test-body': 'immediate' } }
  )
}
