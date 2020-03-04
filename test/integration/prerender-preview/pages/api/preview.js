export default (req, res) => {
  if (req.query.tooBig) {
    try {
      res.setPreviewData(new Array(4000).fill('a'))
    } catch (err) {
      return res.status(500).end('too big')
    }
  } else {
    res.setPreviewData(req.query)
  }

  res.status(200).end()
}
