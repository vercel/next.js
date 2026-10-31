export default function (req, res) {
  res.json({ route: 'users', query: req.query })
}
