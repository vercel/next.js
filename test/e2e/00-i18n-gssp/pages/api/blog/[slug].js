export default (req, res) => {
  res.json({ hello: 'world', query: req.query })
}
