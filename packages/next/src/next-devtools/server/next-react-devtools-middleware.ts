import type { IncomingMessage, ServerResponse } from 'http'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { parse } from 'url'

import { middlewareResponse } from './middleware-response'

const NEXT_REACT_DEVTOOLS_FRONTEND_SCRIPT_PATH =
  '/__nextjs_react_devtools_frontend.js'

export function nextReactDevToolsMiddleware() {
  return async function reactDevToolsFrontendMiddleware(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ) {
    const pathname = req.url ? parse(req.url).pathname : null

    if (pathname !== NEXT_REACT_DEVTOOLS_FRONTEND_SCRIPT_PATH) {
      next()
      return
    }

    try {
      const source = await readFile(
        join(__dirname, '../../compiled/next-react-devtools/frontend.js')
      )

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
      res.end(source)
    } catch (error) {
      middlewareResponse.internalServerError(res, error)
    }
  }
}
