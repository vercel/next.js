export default function handler(_req, res) {
  res.setHeader('Content-Type', 'application/svg+xml')
  res.end(
    `<svg version="1.0" xmlns="http://www.w3.org/2000/svg" width="60" height="60"><text x="20" y="30">hi</text></svg>`
  )
}
