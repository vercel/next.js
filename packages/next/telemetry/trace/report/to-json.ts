import { randomBytes } from 'crypto'
import { batcher } from './to-zipkin'
import { traceGlobals } from '../shared'
import fs from 'fs'
import path from 'path'

let writeStream: fs.WriteStream
let traceId: string
let batch: ReturnType<typeof batcher> | undefined

const reportToLocalHost = (
  name: string,
  duration: number,
  timestamp: number,
  id: string,
  parentId?: string,
  attrs?: Object
) => {
  const distDir = traceGlobals.get('distDir')
  if (!distDir) {
    return
  }

  if (!traceId) {
    traceId = process.env.TRACE_ID || randomBytes(8).toString('hex')
  }

  if (!batch) {
    batch = batcher(async (events) => {
      if (!writeStream) {
        const tracesDir = path.join(distDir, 'traces')
        await fs.promises.mkdir(tracesDir, { recursive: true })
        const file = path.join(distDir, 'trace')
        writeStream = fs.createWriteStream(file, {
          flags: 'a',
          encoding: 'utf8',
        })
      }
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
