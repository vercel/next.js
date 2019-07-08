export default (req, res) => {
  res.json({ post: req.query.id })
}
