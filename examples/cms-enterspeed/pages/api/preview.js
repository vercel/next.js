export default async function preview(req, res) {
  // Check the secret and next parameters
  // This secret should only be known by this API route
  if (req.query.secret === undefined || null) {
    return res.status(401).json({ message: 'No token provided' })
  }

  if (req.query.secret !== process.env.ENTERSPEED_PREVIEW_SECRET) {
    return res.status(401).json({ message: 'Invalid token' })
  }

  res.setPreviewData({})

  res.redirect('/')
}
