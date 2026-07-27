import type { IncomingMessage, ServerResponse } from 'http'
import send from 'next/dist/compiled/send'

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
