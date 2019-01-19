import url from 'url'
import launchEditor from 'launch-editor'

export default function errorOverlayMiddleware (req, res, next) {
  if (req.url.startsWith('/_next/development/open-stack-frame-in-editor')) {
    const query = url.parse(req.url, true).query
    const lineNumber = parseInt(query.lineNumber, 10) || 1
    const colNumber = parseInt(query.colNumber, 10) || 1
    launchEditor(`${query.fileName}:${lineNumber}:${colNumber}`)
    res.end()
  } else {
    next()
  }
}
