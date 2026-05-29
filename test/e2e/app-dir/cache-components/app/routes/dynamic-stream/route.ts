import type { NextRequest } from 'next/server'

import { getSentinelValue } from '../../getSentinelValue'

export async function GET(request: NextRequest) {
  const result = JSON.stringify({
    value: getSentinelValue(),
    message: 'dynamic stream',
  })
  const part1 = result.slice(0, result.length / 2)
  const part2 = result.slice(result.length / 2)

  const encoder = new TextEncoder()
  const chunks = [encoder.encode(part1), encoder.encode(part2)]

  let sent = 0
  const stream = new ReadableStream({
    async pull(controller) {
      controller.enqueue(chunks[sent++])
      await new Promise((r) => setTimeout(r, 1))
      if (sent === chunks.length) {
        controller.close()
      }
    },
  })
  return new Response(stream)
}
