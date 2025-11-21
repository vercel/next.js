import { traceGlobals, traceId } from '../shared'
import fs from 'fs'
import path from 'path'
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
} from '../../shared/lib/constants'
import type { TraceEvent } from '../types'
import { batcher } from './to-json'

let writeStream: RotatingWriteStream
let batch: ReturnType<typeof batcher> | undefined

const writeStreamOptions = {
  flags: 'a',
  encoding: 'utf8' as const,
}
class RotatingWriteStream {
  file: string
  writeStream!: fs.WriteStream
  size: number
  sizeLimit: number
  private rotatePromise: Promise<void> | undefined
  private drainPromise: Promise<void> | undefined
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
  private async rotate() {
    await this.end()
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
    this.rotatePromise = undefined
  }
  async write(data: string): Promise<void> {
    if (this.rotatePromise) await this.rotatePromise

    this.size += data.length
    if (this.size > this.sizeLimit) {
      await (this.rotatePromise = this.rotate())
    }

    if (!this.writeStream.write(data, 'utf8')) {
      if (this.drainPromise === undefined) {
        this.drainPromise = new Promise<void>((resolve, _reject) => {
          this.writeStream.once('drain', () => {
            this.drainPromise = undefined
            resolve()
          })
        })
      }
      await this.drainPromise
    }
  }

  end(): Promise<void> {
    return new Promise((resolve) => {
      this.writeStream.end(resolve)
    })
  }
}

const allowlistedEvents = new Set([
  'next-build',
  'run-turbopack',
  'run-webpack',
  'run-typescript',
  'run-eslint',
  'static-check',
  'collect-build-traces',
  'static-generation',
  'output-export-full-static-export',
  'adapter-handle-build-complete',
  'output-standalone',
  'telemetry-flush',
])

function reportToJsonBuild(event: TraceEvent) {
  if (!allowlistedEvents.has(event.name)) {
    return
  }

  const distDir = traceGlobals.get('distDir')
  const phase = traceGlobals.get('phase')
  if (!distDir || !phase) {
    return
  }

  // Only report in production builds
  if (phase !== PHASE_PRODUCTION_BUILD) {
    return
  }

  if (!batch) {
    batch = batcher(async (events: TraceEvent[]) => {
      if (!writeStream) {
        await fs.promises.mkdir(distDir, { recursive: true })
        const file = path.join(distDir, 'trace-build')
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
    ...event,
    traceId,
  })
}

export default {
  flushAll: (opts?: { end: boolean }) =>
    batch
      ? batch.flushAll().then(() => {
          const phase = traceGlobals.get('phase')
          // Only end writeStream when manually flushing in production
          if (opts?.end || phase !== PHASE_DEVELOPMENT_SERVER) {
            return writeStream.end()
          }
        })
      : undefined,
  report: reportToJsonBuild,
}
