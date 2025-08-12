export default function handler(req, res) {
  res.json({ slug: req.query.slug })
}
