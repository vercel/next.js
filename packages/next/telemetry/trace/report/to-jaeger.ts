import retry from 'next/dist/compiled/async-retry'
import { randomBytes } from 'crypto'
import fetch from 'node-fetch'
import * as Log from '../../../build/output/log'
// Jaeger uses Zipkin's reporting
import { batcher } from './to-zipkin'

let traceId: string
let batch: ReturnType<typeof batcher> | undefined

const localEndpoint = {
  serviceName: 'nextjs',
  ipv4: '127.0.0.1',
  port: 9411,
}
// Jaeger supports Zipkin's reporting API
const zipkinUrl = `http://${localEndpoint.ipv4}:${localEndpoint.port}`
const jaegerWebUiUrl = `http://${localEndpoint.ipv4}:16686`
const zipkinAPI = `${zipkinUrl}/api/v2/spans`

function logWebUrl() {
  Log.info(
    `Jaeger trace will be available on ${jaegerWebUiUrl}/trace/${traceId}`
  )
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
    logWebUrl()
  }

  if (!batch) {
    batch = batcher((events) => {
      const eventsJson = JSON.stringify(events)
      // Ensure ECONNRESET error is retried 3 times before erroring out
      return retry(
        () =>
          // Send events to zipkin
          fetch(zipkinAPI, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: eventsJson,
          }),
        { minTimeout: 500, retries: 3, factor: 1 }
      )
        .then(async (res: any) => {
          if (res.status !== 202) {
            console.log({
              status: res.status,
              body: await res.text(),
              events: eventsJson,
            })
          }
        })
        .catch(console.log)
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
  flushAll: () =>
    batch ? batch.flushAll().then(() => logWebUrl()) : undefined,
  report: reportToLocalHost,
}
