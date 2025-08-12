export default function handler(req, res) {
  res.json({ rest: req.query.rest.join('/') })
}
