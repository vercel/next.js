import { IncomingMessage, ServerResponse } from 'http'
import send from 'next/dist/compiled/send'

export function serveStatic(
  req: IncomingMessage,
  res: ServerResponse,
  path: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    send(req, path)
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
