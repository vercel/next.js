export default (req, res) => {
  res.clearPreviewData(
    req.query.cookiePath
      ? {
          path: req.query.cookiePath,
        }
      : undefined
  )
  res.status(200).end()
}
