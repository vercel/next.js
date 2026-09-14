const pixel =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg=='

export default function handler(req, res) {
  if (req.headers['cookie']) {
    res.setHeader('content-type', 'image/png')
    res.end(Buffer.from(pixel, 'base64'))
  } else {
    res.status(401).end('cookie was not found')
  }
}
