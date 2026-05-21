export default function handler(_req, res) {
  res.setHeader('Content-Type', 'application/svg+xml')
  res.end('body is not svg to force fallback to Content-Type header')
}
