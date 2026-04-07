/**
 * SSE endpoint at /_next/dev/events
 *
 * Streams HMR cycle results to subscribers. Gated behind NEXT_DEV_EVENTS=1.
 *
 * Usage:
 *   curl -N http://localhost:3000/_next/dev/events
 */
import type { ServerResponse, IncomingMessage } from 'http'
import { subscribe, type HmrBuildResult } from './hmr-cycle-emitter'

export function getDevEventsMiddleware() {
  return async function devEventsMiddleware(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): Promise<void> {
    const { pathname } = new URL(req.url || '', 'http://n')

    if (
      pathname !== '/_next/dev/events' ||
      req.method !== 'GET' ||
      process.env.NEXT_DEV_EVENTS !== '1'
    ) {
      return next()
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    })

    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`)

    const unsubscribe = subscribe((result: HmrBuildResult) => {
      const changedPages = result.changedEntries
        .map((key) => {
          try {
            return JSON.parse(key).page as string
          } catch {
            return key
          }
        })
        .filter((v, i, a) => a.indexOf(v) === i)

      const event = {
        type: 'hmr',
        compilation: {
          status: result.errors.length > 0 ? 'compile_error' : 'ok',
          version: result.hash,
          duration_ms: result.durationMs,
          errors: result.errors,
          warnings: result.warnings,
          changed_pages: changedPages,
        },
      }
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    })

    res.on('close', () => {
      unsubscribe()
    })
  }
}
