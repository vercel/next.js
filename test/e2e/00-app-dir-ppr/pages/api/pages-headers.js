export default function handler(req, res) {
  return res.status(200).json({ port: req.headers['x-forwarded-port'] })
}
