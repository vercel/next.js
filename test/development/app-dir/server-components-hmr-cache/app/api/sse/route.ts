import { setTimeout } from 'timers/promises'

export async function GET() {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let i = 1
      while (true) {
        controller.enqueue(encoder.encode(`data: chunk-${i++}\n\n`))
        await setTimeout(300)
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' },
  })
}
