import { revalidateTag } from 'next/cache'
import { setValue } from '../../../lib/state'

// Mutates the source and calls revalidateTag inside the stream, i.e. after the
// Response object was already returned from the Route Handler.
export async function POST() {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()
      controller.enqueue(encoder.encode('event: start\n\n'))
      await new Promise((resolve) => setTimeout(resolve, 100))
      setValue(2)
      revalidateTag('same-tag', { expire: 0 })
      controller.enqueue(encoder.encode('event: revalidated\n\n'))
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
    },
  })
}
