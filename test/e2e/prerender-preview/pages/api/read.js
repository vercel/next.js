export default (req, res) => {
  const { preview, previewData } = req
  res.json({
    preview,
    previewData,
  })
}
