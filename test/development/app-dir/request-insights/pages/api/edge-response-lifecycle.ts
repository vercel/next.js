export const config = { runtime: 'edge' }

export default function handler() {
  const encoder = new TextEncoder()
  let timer: ReturnType<typeof setTimeout> | undefined

  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('started\n'))
        timer = setTimeout(() => {
          controller.enqueue(encoder.encode('finished\n'))
          controller.close()
        }, 50)
      },
      cancel() {
        if (timer) clearTimeout(timer)
      },
    }),
    {
      headers: { 'Content-Type': 'text/plain' },
      status: 203,
    }
  )
}
