export default (req, res) => {
  res.setPreviewData(req.query)
  res.status(200).end()
}
