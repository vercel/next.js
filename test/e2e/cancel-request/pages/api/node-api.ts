import { IncomingMessage, ServerResponse } from 'http'
import { pipeline } from 'stream'
import { Readable } from '../../readable'

export const config = {
  runtime: 'nodejs',
}

let readable: ReturnType<typeof Readable> | undefined

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const url = new URL(req.url!, 'http://localhost/')

  if (url.searchParams.has('compile')) {
    // The request just wants to trigger compilation.
    res.statusCode = 204
    res.end()
    return
  }

  // Pages API requests have already consumed the body.
  // This is so we don't confuse the request close with the connection close.

  const write = url.searchParams.get('write')

  if (write) {
    const r = (readable = Readable(+write))
    res.on('close', () => {
      r.abort()
    })
    return new Promise((resolve) => {
      pipeline(r.stream, res, () => {
        resolve()
        res.end()
      })
    })
  }

  // The 2nd request should render the stats. We don't use a query param
  // because edge rendering will create a different bundle for that.
  const old = readable

  if (!old) {
    res.statusCode = 500
    res.end(
      'The streamable from the prime request is unexpectedly not available'
    )
    return
  }

  readable = undefined
  const i = await old.finished
  res.end(`${i}`)
}
