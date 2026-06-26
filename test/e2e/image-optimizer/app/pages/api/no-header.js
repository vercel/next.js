export default function handler(_req, res) {
  // Intentionally missing Content-Type header so that
  // the fallback is not served when optimization fails
  res.end('foo')
}
