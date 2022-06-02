export default (req, res) => {
  if (req.query.tooBig) {
    try {
      res.setPreviewData(new Array(2000).fill('a').join(''))
    } catch (err) {
      return res.status(500).end('too big')
    }
  } else {
    res.setPreviewData(
      req.query,
      req.query.cookieMaxAge
        ? {
            maxAge: req.query.cookieMaxAge,
          }
        : undefined
    )
  }

  res.status(200).end()
}
