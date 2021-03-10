import { randomBytes } from 'crypto'
import fetch from 'node-fetch'

let traceId = process.env.TRACE_ID
if (!traceId) {
  traceId = process.env.TRACE_ID = randomBytes(8).toString('hex')
}

const localEndpoint = {
  serviceName: 'zipkin-query',
  ipv4: '127.0.0.1',
  port: 9411,
}
const zipkinUrl = `http://${localEndpoint.ipv4}:${localEndpoint.port}/api/v2/spans`

const reportToLocalHost = (
  name: string,
  duration: number,
  timestamp: number,
  id: string,
  parentId?: string,
  attrs?: Object
) => {
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
  fetch(zipkinUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {})
}

export default reportToLocalHost
