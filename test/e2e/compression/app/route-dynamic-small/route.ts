import { connection } from 'next/server'

export async function GET() {
  await connection()

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('x'.repeat(100)))
      controller.close()
    },
  })
  return new Response(stream, {
    headers: { 'content-type': 'text/plain' },
  })
}
