import { internalServerError } from '../../server/shared'
import { notFound } from '../../../not-found'
import type { ServerResponse } from 'http'
import path from 'path'
import type { IncomingMessage } from 'http'
import * as fs from 'fs/promises'
import { constants } from 'fs'

export function getDevOverlayFontMiddleware() {
  return async function (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): Promise<void> {
    const { pathname } = new URL(`http://n${req.url}`)

    if (!pathname.startsWith('/__nextjs_font/')) {
      return next()
    }

    const fontFile = pathname.replace('/__nextjs_font/', '')
    const fontPath = path.resolve(__dirname, fontFile)

    try {
      const fileExists = await fs.access(fontPath, constants.F_OK).then(
        () => true,
        () => false
      )
      if (!fileExists) return notFound()

      const fontData = await fs.readFile(fontPath)
      res.setHeader('Content-Type', 'font/woff2')
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      res.end(fontData)
    } catch (err) {
      console.error('Failed to serve font:', err)
      return internalServerError(res)
    }
  }
}
