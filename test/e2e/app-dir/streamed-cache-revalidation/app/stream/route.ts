import { revalidateTag } from 'next/cache'

export async function POST(request: Request) {
  const parameters = new URL(request.url).searchParams
  const key = parameters.get('key')!
  const encoder = new TextEncoder()
  let writeTimer: ReturnType<typeof setTimeout>
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('started\n'))
      writeTimer = setTimeout(() => {
        revalidateTag('streamed:' + key, { expire: 0 })
        controller.enqueue(encoder.encode('invalidated\n'))
        controller.close()
      }, 200)
    },
    cancel() {
      clearTimeout(writeTimer)
    },
  })
  return new Response(body, {
    headers: { 'content-type': 'text/event-stream' },
  })
}
