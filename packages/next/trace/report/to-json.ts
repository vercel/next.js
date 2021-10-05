import { randomBytes } from 'crypto'
import { batcher } from './to-zipkin'
import { traceGlobals } from '../shared'
import fs from 'fs'
import path from 'path'
import { PHASE_DEVELOPMENT_SERVER } from '../../shared/lib/constants'

let writeStream: RotatingWriteStream
let traceId: string
let batch: ReturnType<typeof batcher> | undefined

const writeStreamOptions = {
  flags: 'a',
  encoding: 'utf8',
}
class RotatingWriteStream {
  file: string
  writeStream!: fs.WriteStream
  size: number
  sizeLimit: number
  isRotating: Promise<void> | undefined
  constructor(file: string, sizeLimit: number) {
    this.file = file
    this.size = 0
    this.sizeLimit = sizeLimit
    this.createWriteStream()
  }
  private createWriteStream() {
    this.writeStream = fs.createWriteStream(this.file, writeStreamOptions)
  }
  // Recreate the file
  private rotate(): void {
    this.end()
    try {
      fs.unlinkSync(this.file)
    } catch (err: any) {
      // It's fine if the file does not exist yet
      if (err.code !== 'ENOENT') {
        throw err
      }
    }
    this.size = 0
    this.createWriteStream()
  }
  async write(data: string): Promise<void> {
    this.size += data.length

    if (this.size > this.sizeLimit) {
      this.rotate()
    }

    if (!this.writeStream.write(data, 'utf8')) {
      await new Promise<void>((resolve, _reject) => {
        this.writeStream.once('drain', resolve)
      })
    }
  }

  end(): void {
    this.writeStream.end('', 'utf8')
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
  const distDir = traceGlobals.get('distDir')
  const phase = traceGlobals.get('phase')
  if (!distDir || !phase) {
    return
  }

  if (!traceId) {
    traceId = process.env.TRACE_ID || randomBytes(8).toString('hex')
  }

  if (!batch) {
    batch = batcher(async (events) => {
      if (!writeStream) {
        await fs.promises.mkdir(distDir, { recursive: true })
        const file = path.join(distDir, 'trace')
        writeStream = new RotatingWriteStream(
          file,
          // Development is limited to 50MB, production is unlimited
          phase === PHASE_DEVELOPMENT_SERVER ? 52428800 : Infinity
        )
      }
      const eventsJson = JSON.stringify(events)
      try {
        await writeStream.write(eventsJson + '\n')
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
          const phase = traceGlobals.get('phase')
          // Only end writeStream when manually flushing in production
          if (phase !== PHASE_DEVELOPMENT_SERVER) {
            writeStream.end()
          }
        })
      : undefined,
  report: reportToLocalHost,
}
