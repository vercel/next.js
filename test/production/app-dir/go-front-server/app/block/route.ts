import { writeFileSync } from 'fs'
export async function GET() {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('started'))
      setTimeout(() => {
        writeFileSync('node-occupied', 'ready')
        const until = Date.now() + 1500
        while (Date.now() < until) {}
        controller.enqueue(new TextEncoder().encode('finished'))
        controller.close()
      }, 50)
    },
  })
  return new Response(stream)
}
