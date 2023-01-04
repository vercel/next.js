import { PREVIEW_PLASMIC } from '../../plasmic-init'

export default async function preview(req, res) {
  // Check the secret and next parameters
  // This secret should only be known to this API route and the CMS
  if (
    req.query.secret !== process.env.PLASMIC_PREVIEW_SECRET ||
    !req.query.slug
  ) {
    return res.status(401).json({ message: 'Invalid token' })
  }

  // Check if the page with the given `slug` exists
  const pages = await PREVIEW_PLASMIC.fetchPages()
  const pageMeta = pages.find((p) => p.path === req.query.slug)

  // If the slug doesn't exist prevent preview mode from being enabled
  if (!pageMeta) {
    return res.status(401).json({ message: 'Invalid slug' })
  }

  // Enable Preview Mode by setting the cookies
  res.setPreviewData({})

  // Redirect to the path from the fetched post
  // We don't redirect to req.query.slug as that might lead to open redirect vulnerabilities
  res.redirect(pageMeta.path)
}
