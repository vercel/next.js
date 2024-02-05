import type { IncomingMessage, ServerResponse } from 'http'
import send from 'next/dist/compiled/send'

// TODO: Remove this once "send" has updated the "mime", or next.js use custom version of "mime"
// Although "mime" has already add avif in version 2.4.7, "send" is still using mime@1.6.0
send.mime.define({
  'image/avif': ['avif'],
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

export function getContentType(extWithoutDot: string): string | null {
  const { mime } = send
  if ('getType' in mime) {
    // 2.0
    return mime.getType(extWithoutDot)
  }
  // 1.0
  return (mime as any).lookup(extWithoutDot)
}

export function getExtension(contentType: string): string | null {
  const { mime } = send
  if ('getExtension' in mime) {
    // 2.0
    return mime.getExtension(contentType)
  }
  // 1.0
  return (mime as any).extension(contentType)
}
