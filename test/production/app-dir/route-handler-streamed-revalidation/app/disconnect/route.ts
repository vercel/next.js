import { revalidateTag } from 'next/cache'

// Queues a revalidation, then returns only after the client has disconnected,
// so the response body is never read.
export async function POST() {
  revalidateTag('disconnect-tag', { expire: 0 })

  await new Promise((resolve) => setTimeout(resolve, 1000))

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
      console.log('disconnect-body-cancelled')
    },
  })

  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}
