import sharp from 'sharp'

export default function handler(req, res) {
  res.json({ success: Boolean(sharp) })
}
