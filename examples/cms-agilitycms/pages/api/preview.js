import { validatePreview } from '../../lib/api'

export default async function handler(req, res) {
  // Check the secret and next parameters
  // This secret should only be known to this API route and the CMS

  //validate our preview key, also validate the requested page to preview exists
  const validationResp = await validatePreview({
    agilityPreviewKey: req.query.agilitypreviewkey,
    slug: req.query.slug,
    contentID: req.query.contentid,
  })

  if (validationResp.error) {
    return res.status(401).end(`${validationResp.message}`)
  }

  //enable preview mode
  res.setPreviewData({})

  // Redirect to the slug
  res.writeHead(307, { Location: validationResp.slug })
  res.end()
}
