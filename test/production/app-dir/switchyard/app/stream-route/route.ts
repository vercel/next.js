import { connection } from 'next/server'

// Sends one chunk, waits, then sends the second.
export async function GET() {
  await connection()
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode('first\n'))
      await new Promise((resolve) => setTimeout(resolve, 1500))
      controller.enqueue(encoder.encode('second\n'))
      controller.close()
    },
  })
  return new Response(stream, { headers: { 'content-type': 'text/plain' } })
}
