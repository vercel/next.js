import { getPreviewPostBySlug } from '@lib/api'

export default async function preview(req, res) {
  const { secret, slug } = req.query

  if (secret !== process.env.DOTCMS_PREVIEW_SECRET || !slug) {
    return res.status(401).json({ message: 'Invalid token' })
  }

  // Fetch the headless CMS to check if the provided `slug` exists
  const post = await getPreviewPostBySlug(slug, true)

  // If the slug doesn't exist prevent preview mode from being enabled
  if (Object.keys(post.post).length < 1) {
    return res.status(401).json({ message: 'Invalid slug' })
  }

  // Enable Preview Mode by setting the cookies
  res.setPreviewData({})

  // Redirect to the path from the fetched post
  const url = `/posts/${post.post.urlTitle}`
  res.setHeader('Content-Type', 'text/html')
  res.write(
    `<!DOCTYPE html><html><head><meta http-equiv="Refresh" content="0; url=${url}" />
    <script>window.location.href = '${url}'</script>
    </head>
    </html>`
  )
  res.end()
}
