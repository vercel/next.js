import { revalidateTag } from 'next/cache'

// Queues a revalidation before returning, then streams a body that never
// closes on its own. The client aborts mid-stream.
export async function POST() {
  revalidateTag('abort-tag', { expire: 0 })

  const encoder = new TextEncoder()
  let interval: ReturnType<typeof setInterval> | undefined
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('started\n'))
      interval = setInterval(() => {
        controller.enqueue(encoder.encode('tick\n'))
      }, 50)
    },
    cancel() {
      clearInterval(interval)
    },
  })

  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}
