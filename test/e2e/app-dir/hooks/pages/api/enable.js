export default function handler(_req, res) {
  res.setPreviewData({}, { path: '/' }) // TODO: change to draft mode setter
  res.end('Enabled, check cookies')
}
