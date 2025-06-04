import { NextRequest } from 'next/server'
import { Streamable } from './streamable'

export const config = {
  matcher: '/middleware',
}

let streamable: ReturnType<typeof Streamable> | undefined

export default async function handler(req: NextRequest): Promise<Response> {
  if (req.nextUrl.searchParams.has('compile')) {
    // The request just wants to trigger compilation.
    return new Response(null, { status: 204 })
  }

  // Consume the entire request body.
  // This is so we don't confuse the request close with the connection close.
  await req.text()

  const write = req.nextUrl.searchParams.get('write')

  if (write) {
    const s = (streamable = Streamable(+write))

    // The request was aborted before the response was returned.
    if (req.signal.aborted) {
      s.abort()
      return new Response(null, { status: 204 })
    }

    req.signal.onabort = () => {
      s.abort()
    }

    return new Response(s.stream)
  }

  // The 2nd request should render the stats. We don't use a query param
  // because edge rendering will create a different bundle for that.
  const old = streamable

  if (!old) {
    return new Response(
      'The streamable from the prime request is unexpectedly not available',
      { status: 500 }
    )
  }

  streamable = undefined
  const i = await old.finished
  return new Response(`${i}`)
}
