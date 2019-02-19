import url from 'url'
import launchEditor from 'launch-editor'
import fs from 'fs'
import path from 'path'

export default function errorOverlayMiddleware (options) {
  return (req, res, next) => {
    if (req.url.startsWith('/_next/development/open-stack-frame-in-editor')) {
      const query = url.parse(req.url, true).query
      const lineNumber = parseInt(query.lineNumber, 10) || 1
      const colNumber = parseInt(query.colNumber, 10) || 1

      let resolvedFileName = query.fileName

      if (!fs.existsSync(resolvedFileName)) {
        resolvedFileName = path.join(options.dir, resolvedFileName)
      }

      launchEditor(`${resolvedFileName}:${lineNumber}:${colNumber}`)
      res.end()
    } else {
      next()
    }
  }
}
