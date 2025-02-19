import { internalServerError } from '../../server/shared'
import { notFound } from '../../../not-found'
import type { ServerResponse, IncomingMessage } from 'http'
import path from 'path'
import * as fs from 'fs/promises'
import { constants } from 'fs'

const FONT_PREFIX = '/__nextjs_font/'

const VALID_FONTS = [
  'geist-latin-ext.woff2',
  'geist-mono-latin-ext.woff2',
  'geist-latin.woff2',
  'geist-mono-latin.woff2',
]

const FONT_HEADERS = {
  'Content-Type': 'font/woff2',
  'Cache-Control': 'public, max-age=31536000, immutable',
} as const

export function getDevOverlayFontMiddleware() {
  return async function devOverlayFontMiddleware(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): Promise<void> {
    try {
      const { pathname } = new URL(`http://n${req.url}`)

      if (!pathname.startsWith(FONT_PREFIX)) {
        return next()
      }

      const fontFile = pathname.replace(FONT_PREFIX, '')
      if (!VALID_FONTS.includes(fontFile)) {
        return notFound()
      }

      const fontPath = path.resolve(__dirname, fontFile)
      const fileExists = await checkFileExists(fontPath)

      if (!fileExists) {
        return notFound()
      }

      const fontData = await fs.readFile(fontPath)
      Object.entries(FONT_HEADERS).forEach(([key, value]) => {
        res.setHeader(key, value)
      })
      res.end(fontData)
    } catch (err) {
      console.error(
        'Failed to serve font:',
        err instanceof Error ? err.message : err
      )
      return internalServerError(res)
    }
  }
}

async function checkFileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}
