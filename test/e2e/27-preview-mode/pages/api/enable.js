export default (req, res) => {
  res.setPreviewData({ hello: 'world' })
  res.end('preview mode enabled')
}
