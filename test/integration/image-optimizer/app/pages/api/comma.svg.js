export default function handler(_req, res) {
  res.setHeader('Content-Type', 'image/foo, text/html')
  res.end('body is not svg to force fallback to Content-Type header')
}
