export default (req, res) => {
  res.json({
    hello: 'world',
    query: req.query,
    env: process.env.NODE_ENV,
  })
}
