import { randomBytes } from 'crypto'
import fetch from 'node-fetch'
import * as Log from '../../../build/output/log'

let traceId = process.env.TRACE_ID

const localEndpoint = {
  serviceName: 'nextjs',
  ipv4: '127.0.0.1',
  port: 9411,
}
const zipkinUrl = `http://${localEndpoint.ipv4}:${localEndpoint.port}`
const zipkinAPI = `${zipkinUrl}/api/v2/spans`

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
  const body = [
    {
      traceId,
      parentId,
      name,
      id,
      timestamp,
      duration,
      localEndpoint,
      tags: attrs,
    },
  ]

  // We intentionally do not block on I/O here.
  fetch(zipkinAPI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(console.log)
}

export default reportToLocalHost
