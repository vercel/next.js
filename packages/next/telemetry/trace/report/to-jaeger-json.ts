import { randomBytes } from 'crypto'
import { batcher } from './to-zipkin'
import * as Log from '../../../build/output/log'
import fs from 'fs'

let writeStream: fs.WriteStream
let traceId = process.env.TRACE_ID
let batch: ReturnType<typeof batcher> | undefined

const localEndpoint = {
  serviceName: 'nextjs',
  ipv4: '127.0.0.1',
  port: 9411,
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
  }
  if (!writeStream) {
    const file = `${process.cwd()}/jaeger-local-${traceId}`
    writeStream = fs.createWriteStream(file, { flags: 'a', encoding: 'utf8' })
    Log.info(`Trace available on ${file}`)
  }

  if (!batch) {
    batch = batcher(async (events) => {
      const eventsJson = JSON.stringify(events)
      try {
        await new Promise<void>((resolve, reject) => {
          writeStream.write(eventsJson + '\n', 'utf8', (err) => {
            err ? reject(err) : resolve()
          })
        })
      } catch (err) {
        console.log(err)
      }
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
    batch
      ? batch.flushAll().then(() => {
          writeStream.end('', 'utf8')
        })
      : undefined,
  report: reportToLocalHost,
}
