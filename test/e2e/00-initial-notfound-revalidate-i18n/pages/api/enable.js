export default (req, res) => {
  res.setPreviewData({ time: Date.now() })
  res.end('enabled preview mode')
}
