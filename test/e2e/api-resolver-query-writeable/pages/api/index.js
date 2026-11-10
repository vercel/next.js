export default (req, res) => {
  req.query = { ...req.query, changed: 'yes' }
  res.status(200).json({ query: req.query })
}
