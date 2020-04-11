import { validatePreview } from '../../lib/api'

export default async (req, res) => {
  // Check the secret and next parameters
  // This secret should only be known to this API route and the CMS

  //validate our preview key, also validate the requested page to preview exists
  const validationResp = await validatePreview({ 
    agilityPreviewKey: req.query.agilitypreviewkey,
    slug: req.query.slug
  });

  if(validationResp.error) {
      return res.status(401).end(`${validationResp.message}`)
  }

  // Enable Preview Mode by setting the cookies
  res.setPreviewData({})

  // Redirect to the path from the fetched post
  // We don't redirect to req.query.slug as that might lead to open redirect vulnerabilities
  res.writeHead(307, { Location: `${validationResp.slug}` })
  res.end()
}
