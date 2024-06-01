import { unstable_after as after } from 'next/server'
import { cliLog } from '../../utils/log'
import { sleep } from '../../utils/sleep'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  /** @type {ReadableStream<Uint8Array>} */
  const result = new ReadableStream({
    async start(controller) {
      cliLog({
        source: '[route handler] /route-streaming - body, sleeping',
      })
      await sleep(500)
      cliLog({
        source: '[route handler] /route-streaming - body, done sleeping',
      })

      const encoder = new TextEncoder()
      for (const chunk of ['one', 'two', 'three']) {
        await sleep(500)
        controller.enqueue(encoder.encode(chunk + '\r\n'))
      }
      after(async () => {
        await sleep(1000)
        cliLog({
          source: '[route handler] /route-streaming - after',
        })
      })
      controller.close()
    },
  })
  return new Response(result, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'transfer-encoding': 'chunked',
    },
  })
}
