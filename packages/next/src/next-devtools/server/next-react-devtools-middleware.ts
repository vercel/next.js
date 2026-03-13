import type { IncomingMessage, ServerResponse } from 'http'
import { readFile } from 'fs/promises'
import { join, posix, win32 } from 'path'

import { middlewareResponse } from './middleware-response'

const NEXT_REACT_DEVTOOLS_ASSET_PATH = '/__nextjs_react_devtools/'
const NEXT_REACT_DEVTOOLS_FRONTEND_PATH = `${NEXT_REACT_DEVTOOLS_ASSET_PATH}frontend.js`

/**
 * React DevTools emits flat asset files here, so reject anything that looks
 * like a nested or platform-specific path traversal before joining it.
 */
function getReactDevToolsExtraAssetPath(
  pathname: string | null
): string | null {
  if (
    pathname === null ||
    pathname === NEXT_REACT_DEVTOOLS_FRONTEND_PATH ||
    !pathname.startsWith(NEXT_REACT_DEVTOOLS_ASSET_PATH)
  ) {
    return null
  }

  const assetPath = pathname.slice(NEXT_REACT_DEVTOOLS_ASSET_PATH.length)
  if (
    assetPath.length === 0 ||
    assetPath !== posix.basename(assetPath) ||
    assetPath !== win32.basename(assetPath) ||
    (!assetPath.endsWith('.js') && !assetPath.endsWith('.js.map'))
  ) {
    return null
  }

  return assetPath
}

export function nextReactDevToolsMiddleware() {
  return async function reactDevToolsFrontendMiddleware(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ) {
    const pathname = req.url ? new URL(req.url, 'http://n').pathname : null

    if (pathname === NEXT_REACT_DEVTOOLS_FRONTEND_PATH) {
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
      return
    }

    const assetPath = getReactDevToolsExtraAssetPath(pathname)
    if (assetPath === null) {
      next()
      return
    }

    try {
      const source = await readFile(
        join(__dirname, '../../compiled/next-react-devtools', assetPath)
      )

      res.statusCode = 200
      res.setHeader(
        'Content-Type',
        assetPath.endsWith('.map')
          ? 'application/json; charset=utf-8'
          : 'application/javascript; charset=utf-8'
      )
      res.end(source)
    } catch (error) {
      middlewareResponse.internalServerError(res, error)
    }
  }
}
