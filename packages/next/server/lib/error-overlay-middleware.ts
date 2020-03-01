import url from 'url'
import launchEditor from 'launch-editor'
import fs from 'fs'
import path from 'path'
import { IncomingMessage, ServerResponse } from 'http'

export default function errorOverlayMiddleware(options: { dir: string }) {
  return (req: IncomingMessage, res: ServerResponse, next: Function) => {
    if (req.url!.startsWith('/_next/development/open-stack-frame-in-editor')) {
      const query = url.parse(req.url!, true).query
      const lineNumber = parseInt(query.lineNumber as string, 10) || 1
      const colNumber = parseInt(query.colNumber as string, 10) || 1

      let resolvedFileName = query.fileName

      if (!fs.existsSync(resolvedFileName as string)) {
        resolvedFileName = path.join(options.dir, resolvedFileName as string)
      }

      launchEditor(`${resolvedFileName}:${lineNumber}:${colNumber}`)
      res.end()
    } else {
      next()
    }
  }
}
