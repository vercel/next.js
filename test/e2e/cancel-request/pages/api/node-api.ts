import { IncomingMessage, ServerResponse } from 'http'
import { pipeline } from 'stream'
import { Readable } from '../../readable'

export const config = {
  runtime: 'nodejs',
}

let readable
let requestAborted = false

export default function handler(
  _req: IncomingMessage,
  res: ServerResponse
): void {
  // The 2nd request should render the stats. We don't use a query param
  // because edge rendering will create a different bundle for that.
  if (readable) {
    res.end(
      JSON.stringify({
        requestAborted,
        i: readable.i,
        streamCleanedUp: readable.streamCleanedUp,
      })
    )
    return
  }

  readable = Readable()
  res.on('close', () => {
    requestAborted = true
  })
  pipeline(readable.stream, res, () => {
    res.end()
  })
}
