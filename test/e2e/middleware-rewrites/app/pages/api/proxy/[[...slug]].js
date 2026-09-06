export default function handler(req, res) {
  res.status(200).json({
    url: req.url,
    query: req.query,
  })
}
