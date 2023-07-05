import { Streamable } from '../../streamable'

export const runtime = 'edge'

let streamable
let requestAborted = false

export function GET(req: Request): Response {
  // The 2nd request should render the stats. We don't use a query param
  // because edge rendering will create a different bundle for that.
  if (streamable) {
    return new Response(
      JSON.stringify({
        requestAborted,
        i: streamable.i,
        streamCleanedUp: streamable.streamCleanedUp,
      })
    )
  }

  streamable = Streamable()
  req.signal.onabort = () => {
    requestAborted = true
  }
  return new Response(streamable.stream)
}
