export default function handler(req, res) {
  res.setPreviewData({ key: 'value' })
  res.send(200).end()
}
