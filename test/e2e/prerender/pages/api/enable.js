export default function handler(req, res) {
  res.setPreviewData({ hello: 'world' })
  res.json({ enabled: true })
}
