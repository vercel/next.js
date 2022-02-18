import type { NextServer } from 'next/dist/server/next'
import type { Lifecycle } from '@hapi/hapi'
import type { NextUrlWithParsedQuery } from 'next/dist/server/request-meta'

const nextHandlerWrapper = (app: NextServer): Lifecycle.Method => {
  const handler = app.getRequestHandler()

  return async ({ raw, url, query }, h) => {
    const nextUrl = url as unknown as NextUrlWithParsedQuery
    nextUrl.query = query
    await handler(raw.req, raw.res, nextUrl)
    return h.close
  }
}

export { nextHandlerWrapper }
