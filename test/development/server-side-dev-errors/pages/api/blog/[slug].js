export default function handler(req, res) {
  res.status(200).json({ slug: req.query.slug })
}
