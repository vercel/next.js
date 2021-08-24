import retry from 'next/dist/compiled/async-retry'
import { randomBytes } from 'crypto'
import fetch from 'node-fetch'
import * as Log from '../../../build/output/log'

let traceId: string
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
  localEndpoint?: typeof localEndpoint
  tags?: Object
}

// Batch events as zipkin allows for multiple events to be sent in one go
export function batcher(reportEvents: (evts: Event[]) => Promise<void>) {
  const events: Event[] = []
  // Promise queue to ensure events are always sent on flushAll
  const queue = new Set()
  return {
    flushAll: async () => {
      await Promise.all(queue)
      if (events.length > 0) {
        await reportEvents(events)
        events.length = 0
      }
    },
    report: (event: Event) => {
      events.push(event)

      if (events.length > 100) {
        const evts = events.slice()
        events.length = 0
        const report = reportEvents(evts)
        queue.add(report)
        report.then(() => queue.delete(report))
      }
    },
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
    traceId = process.env.TRACE_ID || randomBytes(8).toString('hex')
    Log.info(
      `Zipkin trace will be available on ${zipkinUrl}/zipkin/traces/${traceId}`
    )
  }

  if (!batch) {
    batch = batcher((events) => {
      // Ensure ECONNRESET error is retried 3 times before erroring out
      return retry(
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

  batch.report({
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

export default {
  flushAll: () => (batch ? batch.flushAll() : undefined),
  report: reportToLocalHost,
}
