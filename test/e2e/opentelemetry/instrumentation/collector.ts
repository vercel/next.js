import { Server as HttpServer } from 'node:http'
import { SavedSpan } from './constants'

export interface Collector {
  getSpans: () => SavedSpan[]
  /**
   * Like `getSpans`, but also includes spans marked `next.bubble` (e.g.
   * next-server's middleware-invoke `handleRequest` span), which are needed to
   * check the full span hierarchy of a request.
   */
  getAllSpans: () => SavedSpan[]
  reset: () => void
  shutdown: () => Promise<void>
}

export async function connectCollector({
  port,
}: {
  port: number
}): Promise<Collector> {
  const spans: SavedSpan[] = []
  const allSpans: SavedSpan[] = []

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
    allSpans.push(...newSpans)
    const filteredSpans = newSpans.filter((span) => {
      if (span.attributes?.['next.bubble'] === true) {
        return false
      }
      return true
    })
    spans.push(...filteredSpans)
    // Exporters can leave pooled sockets idle between tests. Close each
    // response so a server keep-alive timeout cannot drop a later export.
    res.setHeader('Connection', 'close')
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
    getAllSpans() {
      return allSpans
    },
    reset() {
      spans.length = 0
      allSpans.length = 0
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
