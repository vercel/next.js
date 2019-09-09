import { IncomingMessage, ServerResponse } from 'http'
import send from 'send'

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
