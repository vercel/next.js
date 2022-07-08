export default function handler(req, res) {
  res.json({ url: req.url, headers: req.headers })
}
