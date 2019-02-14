import url from 'url'
import launchEditor from 'launch-editor'
import path from 'path'

export default function errorOverlayMiddleware(req, res, next) {

  const srcRoot = process.cwd()

  if (req.url.startsWith('/_next/development/open-stack-frame-in-editor')) {
    const query = url.parse(req.url, true).query
    const lineNumber = parseInt(query.lineNumber, 10) || 1
    const colNumber = parseInt(query.colNumber, 10) || 1

    const resolvedFileName = path.join(srcRoot, query.fileName)

    launchEditor(`${resolvedFileName}:${lineNumber}:${colNumber}`)
    res.end()
  } else {
    next()
  }
}
