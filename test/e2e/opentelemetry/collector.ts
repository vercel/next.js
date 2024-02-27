import { Server as HttpServer } from 'node:http'
import { SavedSpan } from './constants'

export interface Collector {
  getSpans: () => SavedSpan[]
  shutdown: () => Promise<void>
}

export async function connectCollector({
  port,
}: {
  port: number
}): Promise<Collector> {
  const spans: SavedSpan[] = []

  const server = new HttpServer(async (req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405)
      res.end()
      return
    }

    const body = await new Promise<Buffer>((resolve, reject) => {
      const acc: Buffer[] = []
      req.on('data', (chunk: Buffer) => {
        acc.push(chunk)
      })
      req.on('end', () => {
        resolve(Buffer.concat(acc))
      })
      req.on('error', reject)
    })

    const newSpans = JSON.parse(body.toString('utf-8')) as SavedSpan[]
    const filteredSpans = newSpans.filter((span) => {
      if (span.attributes?.['next.bubble'] === true) {
        return false
      }
      return true
    })
    spans.push(...filteredSpans)
    res.statusCode = 202
    res.end()
  })

  await new Promise<void>((resolve, reject) => {
    server.listen(port, (err?: Error) => {
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    })
  })

  return {
    getSpans() {
      return spans
    },
    shutdown() {
      return new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      ).catch((err) => {
        console.warn('WARN: collector server disconnect failure:', err)
      })
    },
  }
}
