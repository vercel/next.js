export default function handler(req, res) {
  res.setPreviewData({ key: 'value' })
  res.status(200).end()
}
