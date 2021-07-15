import Stack from '../../lib/api'

export default async function preview(req, res) {
  const { secret, slug } = req.query

  if (secret !== process.env.contentstack_preview_secret || !slug) {
    return res.status(401).json({ message: 'Invalid token' })
  }

  // Fetch the headless CMS to check if the provided `slug` exists
  const slugEntry = await Stack.getSpecificEntry('post', '/' + slug, 'author')
  const post = await Stack.getPreviewData(slugEntry[0].uid)
  // If the slug doesn't exist prevent preview mode from being enabled
  if (!post) {
    return res.status(401).json({ message: 'Invalid slug' })
  }

  // Enable Preview Mode by setting the cookies
  res.setPreviewData({})

  res.redirect('/posts/' + post.slug)
  res.end('Preview mode enabled')
}
