import type { ServerResponse } from 'http'
import { inspect } from 'util'

export const middlewareResponse = {
  noContent(res: ServerResponse) {
    res.statusCode = 204
    res.end('No Content')
  },
  notFound(res: ServerResponse) {
    res.statusCode = 404
    res.end('Not Found')
  },
  badRequest(res: ServerResponse) {
    res.statusCode = 400
    res.end('Bad Request')
  },
  internalServerError(res: ServerResponse, error?: unknown) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'text/plain')
    res.end(
      error !== undefined
        ? inspect(error, { colors: false })
        : 'Internal Server Error'
    )
  },
  json(res: ServerResponse, data: any) {
    res
      .setHeader('Content-Type', 'application/json')
      .end(Buffer.from(JSON.stringify(data)))
  },
  jsonString(res: ServerResponse, data: string) {
    res.setHeader('Content-Type', 'application/json').end(Buffer.from(data))
  },
}
