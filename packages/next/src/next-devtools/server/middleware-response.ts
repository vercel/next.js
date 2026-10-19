import type { ServerResponse } from 'http'
import { inspect } from 'util'

export const middlewareResponse = {
  noContent(res: ServerResponse): void {
    res.statusCode = 204
    res.end('No Content')
  },
  badRequest(res: ServerResponse, reason?: string): void {
    res.statusCode = 400
    if (reason !== undefined) {
      res.setHeader('Content-Type', 'text/plain')
      res.end(reason)
    } else {
      res.end()
    }
  },
  notFound(res: ServerResponse): void {
    res.statusCode = 404
    res.end('Not Found')
  },
  methodNotAllowed(res: ServerResponse): void {
    res.statusCode = 405
    res.end('Method Not Allowed')
  },
  internalServerError(res: ServerResponse, error?: unknown): void {
    res.statusCode = 500
    res.setHeader('Content-Type', 'text/plain')
    res.end(
      error !== undefined
        ? inspect(error, { colors: false })
        : 'Internal Server Error'
    )
  },
  json(res: ServerResponse, data: unknown): void {
    res
      .setHeader('Content-Type', 'application/json')
      .end(Buffer.from(JSON.stringify(data)))
  },
  jsonString(res: ServerResponse, data: string): void {
    res.setHeader('Content-Type', 'application/json').end(Buffer.from(data))
  },
}
