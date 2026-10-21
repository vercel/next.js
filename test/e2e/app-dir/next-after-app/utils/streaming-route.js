import { cookies, headers } from 'next/headers'
import { after } from 'next/server'
import { cliLog } from './log'

const pendingStreams = new Map()

export async function streamingRoute(request) {
  const { searchParams } = new URL(request.url)
  const releaseId = searchParams.get('release')
  if (releaseId) {
    pendingStreams.get(releaseId)?.()
    return new Response('released')
  }

  const id = request.headers.get('x-stream-id') || 'bodyless'
  const cookieStore = await cookies()
  cookieStore.set('from-handler', id)

  if (searchParams.has('status') || request.method === 'HEAD') {
    const status = Number(searchParams.get('status') || 200)
    after(() => {
      cliLog({
        source: '[route handler] /streaming-bodyless',
        status,
        method: request.method,
      })
    })
    const body =
      request.method === 'HEAD'
        ? new ReadableStream(
            {
              pull(controller) {
                controller.enqueue(new TextEncoder().encode('HEAD body'))
                controller.close()
              },
            },
            { highWaterMark: 0 }
          )
        : null
    return new Response(body, {
      status,
      headers: { 'set-cookie': 'from-response=explicit; Path=/' },
    })
  }

  const released = new Promise((resolve) => pendingStreams.set(id, resolve))
  const encoder = new TextEncoder()
  const registerAfter = (chunk) => {
    after(async () => {
      cliLog({
        source: '[route handler] /streaming',
        chunk,
        header: (await headers()).get('x-stream-id'),
        cookie: (await cookies()).get('stream-id')?.value,
      })
    })
  }
  const upstream = new TransformStream({
    transform(chunk, controller) {
      registerAfter(chunk)
      controller.enqueue(encoder.encode(chunk + '\n'))
    },
    flush() {
      registerAfter('flush')
    },
  })
  const body = upstream.readable.pipeThrough(new TransformStream())
  const writer = upstream.writable.getWriter()

  // Settle start, then let one write reach the second transform. That transform
  // cannot finish its write until the response body has a reader. The next
  // upstream write is therefore parked under backpressure before we return.
  await writer.ready
  await writer.write('first')
  const parkedWrite = writer.write('second')

  void (async () => {
    try {
      await parkedWrite
      // Keep this response open while another request finishes, so the test can
      // check both request isolation and that after() waits for response close.
      await released
      await writer.write('third')
      await writer.close()
    } catch (error) {
      // Transform errors also propagate through the response body.
      console.error(error)
    } finally {
      pendingStreams.delete(id)
      writer.releaseLock()
    }
  })()

  return new Response(body, {
    status: 201,
    statusText: 'Streamed',
    headers: {
      'content-type': 'text/plain',
      'x-stream-id': id,
      'set-cookie': 'from-response=explicit; Path=/',
    },
  })
}
