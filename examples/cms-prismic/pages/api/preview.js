import { PrismicClient } from '../../lib/api'

function linkResolver(doc) {
  // Pretty URLs for known types
  if (doc.type === 'post') {
    return `/posts/${doc.uid}`
  }

  // Fallback for other types, in case new custom types get created
  return `/${doc.id}`
}

export default async (req, res) => {
  const ref = req.query.token

  // Check the token parameter against the Prismic SDK
  const url = await PrismicClient.previewSession(ref, linkResolver, '/')

  if (!url) {
    return res.status(401).json({ message: 'Invalid token' })
  }

  // Enable Preview Mode by setting the cookies
  res.setPreviewData({
    ref, // pass the ref to pages so that they can fetch the draft ref
  })

  // Redirect to the path from the fetched post
  // We don't redirect to req.query.slug as that might lead to open redirect vulnerabilities
  res.writeHead(307, { Location: url })
  res.end()
}
