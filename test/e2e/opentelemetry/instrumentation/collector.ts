import { Server as HttpServer } from 'node:http'
import { SavedSpan } from './constants'

export interface Collector {
  getSpans: () => SavedSpan[]
  shutdown: () => Promise<void>
  getSnapshot: () => SpanSnapshotNode[]
}

export type SpanSnapshotNode = Omit<
  SavedSpan,
  'id' | 'parentId' | 'traceId' | 'duration' | 'timestamp'
> & {
  children: SpanSnapshotNode[]
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
    getSnapshot(): SpanSnapshotNode[] {
      const nodeMap = new Map<string, SpanSnapshotNode>()
      spans.sort((a, b) => b.timestamp - a.timestamp)
      for (const span of spans) {
        const node: SpanSnapshotNode = { ...span, children: [] }
        delete (node as SavedSpan).id
        delete (node as SavedSpan).parentId
        delete (node as SavedSpan).traceId
        delete (node as SavedSpan).timestamp
        delete (node as SavedSpan).duration

        nodeMap.set(span.id, node)
      }

      const rootSpans: SpanSnapshotNode[] = []

      for (const span of spans) {
        const spanNode = nodeMap.get(span.id)

        if (span.parentId && nodeMap.has(span.parentId)) {
          // Add as child to parent
          const parentNode = nodeMap.get(span.parentId)
          parentNode.children.push(spanNode)
        } else {
          // No parent or parent not in the list, treat as root
          rootSpans.push(spanNode)
        }
      }

      return rootSpans
    },
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
