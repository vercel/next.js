import { revalidateTag } from 'next/cache'

// Simulates a handler that returns a streamed response first and performs the
// write that needs revalidating while the body streams (e.g. an MCP tool call
// on the Streamable HTTP transport).
export async function POST() {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('started\n'))
      setTimeout(() => {
        revalidateTag('late-tag', { expire: 0 })
        controller.enqueue(encoder.encode('done\n'))
        controller.close()
      }, 100)
    },
  })

  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}
