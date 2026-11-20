import { waitForRelease } from '../../lib/release'

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id')!
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode('first\n'))
        await waitForRelease(id)
        controller.enqueue(encoder.encode('last\n'))
        controller.close()
      },
    }),
    { headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } }
  )
}
