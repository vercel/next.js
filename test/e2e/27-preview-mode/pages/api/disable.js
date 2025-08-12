export default (req, res) => {
  res.clearPreviewData()
  res.end('preview mode disabled')
}
