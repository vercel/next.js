import { trace } from '@opentelemetry/api'
import { after } from 'next/server'

export function GET(request: Request) {
  const shouldFail = new URL(request.url).searchParams.has('fail')

  after(async () => {
    await trace
      .getTracer('after-fixture')
      .startActiveSpan('work inside after callback', async (span) => {
        try {
          await new Promise<void>((resolve) => queueMicrotask(resolve))
        } finally {
          span.end()
        }
      })

    if (shouldFail) {
      throw new Error('expected after callback failure')
    }
  })

  after(Promise.resolve())

  return Response.json({ ok: true })
}
