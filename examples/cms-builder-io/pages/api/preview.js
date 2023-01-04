import { getDraftPost } from '@/lib/api'
import { BUILDER_CONFIG } from '@/lib/constants'
import querystring from 'querystring'

export default async function preview(req, res) {
  const postId = req.query[`builder.overrides.${BUILDER_CONFIG.postsModel}`]
  if (req.query.secret !== BUILDER_CONFIG.previewSecret || !postId) {
    return res.status(401).json({ message: 'Invalid request' })
  }

  // Check if the post with the given `slug` exists
  const post = await getDraftPost(postId)

  // If the slug doesn't exist prevent preview mode from being enabled
  if (!post) {
    return res.status(401).json({ message: 'Invalid post' })
  }

  // Enable Preview Mode by setting the cookies
  res.setPreviewData({
    postDraftId: postId,
  })

  // Redirect to the path from the fetched post
  // We don't redirect to req.query.slug as that might lead to open redirect vulnerabilities
  res.writeHead(307, {
    Location: `/posts/${post.data.slug}?${querystring.stringify(req.query)}`,
  })
  res.end()
}
