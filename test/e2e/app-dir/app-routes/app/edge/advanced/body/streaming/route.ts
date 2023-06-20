import type { NextRequest } from 'next/server'

export const runtime = 'experimental-edge'

export async function POST(request: NextRequest) {
  const reader = request.body?.getReader()
  if (!reader) {
    return new Response(null, { status: 400, statusText: 'Bad Request' })
  }

  // Readable stream here is polyfilled from the Fetch API (from undici).
  const stream = new ReadableStream({
    async pull(controller) {
      // Read the next chunk from the stream.
      const { value, done } = await reader.read()
      if (done) {
        // Finish the stream.
        return controller.close()
      }

      // Add the request value to the response stream.
      controller.enqueue(value)
    },
  })

  return new Response(stream, { status: 200 })
}
