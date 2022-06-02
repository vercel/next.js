export default (req, res) => {
  res.json({ hello: true, query: req.query })
}
