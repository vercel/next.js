export default function handler(req, res) {
  res.send(
    'API Node instrumentationFinished=' +
      (globalThis as any).instrumentationFinished
  )
}
