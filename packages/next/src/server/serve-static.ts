import type { IncomingMessage, ServerResponse } from 'http'
import send from 'next/dist/compiled/send'
import { existsSync, createReadStream, statSync } from 'fs'
import * as pathModule from 'path'

// TODO: Remove this once "send" has updated the "mime", or next.js use custom version of "mime"
// Although "mime" has already add avif in version 2.4.7, "send" is still using mime@1.6.0
send.mime.define({
  'image/avif': ['avif'],
  'image/x-icns': ['icns'],
  'image/jxl': ['jxl'],
  'image/heic': ['heic'],
})

export function serveStatic(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  opts?: Parameters<typeof send>[2]
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Handle %5F encoding issue in development mode - fixes #82724
    // The send module internally decodes URLs, but our files have %5F in their actual names
    if (opts?.root && (path.includes('%5F') || path.includes('%5f'))) {
      const fullPath = pathModule.join(opts.root, path)
      const decodedPath = path.replace(/%5F/g, '_').replace(/%5f/g, '_')
      const decodedFullPath = pathModule.join(opts.root, decodedPath)

      // If the encoded version exists but decoded doesn't, serve directly
      if (existsSync(fullPath) && !existsSync(decodedFullPath)) {
        try {
          const stats = statSync(fullPath)
          const stream = createReadStream(fullPath)

          res.setHeader('Content-Length', stats.size)
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store, must-revalidate')

          stream.pipe(res)
          stream.on('end', resolve)
          stream.on('error', reject)

          return // Exit early, don't use send module
        } catch (err) {
          // Fall through to use send module
        }
      }
    }

    send(req, path, opts)
      .on('directory', () => {
        // We don't allow directories to be read.
        const err: any = new Error('No directory access')
        err.code = 'ENOENT'
        reject(err)
      })
      .on('error', reject)
      .pipe(res)
      .on('finish', resolve)
  })
}

export const getContentType: (extWithoutDot: string) => string | null =
  'getType' in send.mime
    ? (extWithoutDot: string) => send.mime.getType(extWithoutDot)
    : (extWithoutDot: string) => (send.mime as any).lookup(extWithoutDot)

export const getExtension: (contentType: string) => string | null =
  'getExtension' in send.mime
    ? (contentType: string) => send.mime.getExtension(contentType)
    : (contentType: string) => (send.mime as any).extension(contentType)
