import retry from 'next/dist/compiled/async-retry'
import { randomBytes } from 'crypto'
import fetch from 'node-fetch'
import * as Log from '../../../build/output/log'

let traceId = process.env.TRACE_ID
let batch: ReturnType<typeof batcher> | undefined

const localEndpoint = {
  serviceName: 'nextjs',
  ipv4: '127.0.0.1',
  port: 9411,
}
const zipkinUrl = `http://${localEndpoint.ipv4}:${localEndpoint.port}`
const zipkinAPI = `${zipkinUrl}/api/v2/spans`

type Event = {
  traceId: string
  parentId?: string
  name: string
  id: string
  timestamp: number
  duration: number
  localEndpoint: typeof localEndpoint
  tags?: Object
}

// Batch events as zipkin allows for multiple events to be sent in one go
function batcher(reportEvents: (evts: Event[]) => void) {
  const events: Event[] = []
  let timeout: ReturnType<typeof setTimeout> | undefined
  return (event: Event) => {
    events.push(event)
    // setTimeout is used instead of setInterval to ensure events sending does not block exiting the program
    if (!timeout) {
      timeout = setTimeout(() => {
        reportEvents(events.slice())
        events.length = 0
        timeout = undefined
      }, 1500)
    }
  }
}

const reportToLocalHost = (
  name: string,
  duration: number,
  timestamp: number,
  id: string,
  parentId?: string,
  attrs?: Object
) => {
  if (!traceId) {
    traceId = process.env.TRACE_ID = randomBytes(8).toString('hex')
    Log.info(
      `Zipkin trace will be available on ${zipkinUrl}/zipkin/traces/${traceId}`
    )
  }

  if (!batch) {
    batch = batcher((events) => {
      // Ensure ECONNRESET error is retried 3 times before erroring out
      retry(
        () =>
          // Send events to zipkin
          fetch(zipkinAPI, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(events),
          }),
        { minTimeout: 500, retries: 3, factor: 1 }
      ).catch(console.log)
    })
  }

  batch({
    traceId,
    parentId,
    name,
    id,
    timestamp,
    duration,
    localEndpoint,
    tags: attrs,
  })
}

export default reportToLocalHost
