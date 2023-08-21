import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

function iteratorToStream<T>(iterator: AsyncIterator<T>) {
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next()

      if (done) {
        controller.close()
      } else {
        controller.enqueue(value)
      }
    },
  })
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function* count(n: number) {
  for (let i = 0; i < n; i++) {
    yield String(i)
    await sleep(100)
  }
}

export function middleware(_request: NextRequest) {
  return new NextResponse(iteratorToStream(count(10)))
}

export const config = {
  matcher: '/stream',
}
