export default (req, res) => {
  res.json({ post: true, query: req.query })
}
