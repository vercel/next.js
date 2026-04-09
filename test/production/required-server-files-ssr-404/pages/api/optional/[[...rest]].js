export default (req, res) => {
  console.log(req.url, 'query', req.query)
  res.json({
    url: req.url,
    query: req.query,
  })
}
