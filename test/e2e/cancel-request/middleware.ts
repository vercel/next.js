import { Streamable } from './streamable'

export const config = {
  matcher: '/middleware',
}

let streamable: ReturnType<typeof Streamable> | undefined

export default async function handler(req: Request): Promise<Response> {
  // Consume the entire request body.
  // This is so we don't confuse the request close with the connection close.
  await req.text()

  const write = new URL(req.url!, 'http://localhost/').searchParams.get('write')

  if (write) {
    const s = (streamable = Streamable(+write!))
    req.signal.onabort = () => {
      s.abort()
    }
    return new Response(s.stream)
  }

  // The 2nd request should render the stats. We don't use a query param
  // because edge rendering will create a different bundle for that.
  const old = streamable!
  streamable = undefined
  const i = await old.finished
  return new Response(`${i}`)
}
