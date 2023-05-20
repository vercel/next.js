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
    // Note: if this fails to parse you may have forget to set the
    // "content-type" header correctly as mentioned here https://github.com/vercel/next.js/blob/canary/examples/cms-contentful/README.md#step-9-try-using-on-demand-revalidation
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
