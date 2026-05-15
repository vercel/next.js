export default (req, res) => {
  res.clearPreviewData()
  res.status(200).end()
}
