// pages/api/revalidate.js

export default async function handler(req, res) {
  // should be secret, custom header coming in from Contentful
  let inboundRevalToken = req.headers['x-vercel-reval-key']

  // Check for secret to confirm this is a valid request
  if (!inboundRevalToken) {
    return res
      .status(401)
      .json({ message: 'x-vercel-reval-key header not defined' })
  } else if (inboundRevalToken !== process.env.CONTENTFUL_REVALIDATE_SECRET) {
    return res.status(401).json({ message: 'Invalid token' })
  }

  try {
    let postSlug = req.body.fields.slug['en-US']

    // revalidate the individual post and the home page
    await res.revalidate(`/posts/${postSlug}`)
    await res.revalidate('/')

    return res.json({ revalidated: true })
  } catch (err) {
    // If there was an error, Next.js will continue
    // to show the last successfully generated page
    return res.status(500).send('Error revalidating')
  }
}
