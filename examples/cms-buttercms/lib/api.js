import Butter from 'buttercms'
const butter = Butter(process.env.BUTTERCMS_API_KEY)

export async function getPreviewPostBySlug(slug) {
  const postResponse = await butter.post.retrieve(slug, {
    preview: 1,
  })
  return postResponse?.data?.data
}

export async function getAllPostsWithSlug() {
  // https://buttercms.com/docs/api/node?javascript#get-your-blog-posts
  const response = await butter.post.list()
  return response?.data?.data
}

export async function getAllPostsForHome(preview) {
  const response = await butter.post.list({ preview: preview ? 1 : 0 })
  return response?.data?.data
}

export async function getPostAndMorePosts(slug, preview) {
  const postResponse = await butter.post.retrieve(slug, {
    preview: preview ? 1 : 0,
  })
  const postListResponse = await butter.post.list()
  return {
    post: postResponse?.data?.data,
    morePosts: postListResponse?.data?.data.filter(
      ({ slug: postSlug }) => postSlug !== slug
    ),
  }
}
