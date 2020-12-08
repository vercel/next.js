import GhostContentAPI from '@tryghost/content-api'

const GHOST_API_URL = process.env.GHOST_API_URL || 'https://cms.gotsby.org'
const GHOST_API_KEY = process.env.GHOST_API_KEY || '387f956eaa95345f7bb484d0b8'

const api = new GhostContentAPI({
  url: GHOST_API_URL,
  key: GHOST_API_KEY,
  version: 'v3',
})

const is404 = (error) => /not found/i.test(error.message)

export async function getPreviewPostBySlug(slug) {
  const params = {
    slug,
    fields: 'slug',
    limit: 'all',
  }

  try {
    const post = await api.posts.read(params)
    return post
  } catch (error) {
    // Don't throw if an slug doesn't exist
    if (is404(error)) return
    throw error
  }
}

export async function getAllPostsWithSlug() {
  const params = {
    fields: 'slug',
    limit: 'all',
  }
  const posts = await api.posts.browse(params)
  return posts
}

export async function getAllPostsForHome(preview) {
  const params = {
    limit: 'all',
    include: 'authors',
    order: 'published_at DESC',
    ...(preview && { status: 'all' }),
  }
  const posts = await api.posts.browse(params)
  return posts
}

export async function getPostAndMorePosts(slug, preview) {
  const singleObjectParams = {
    slug,
    include: 'authors',
    ...(preview && { status: 'all' }),
  }
  const moreObjectParams = {
    limit: 3,
    include: 'authors',
    ...(preview && { status: 'all' }),
  }
  const post = await api.posts.read(singleObjectParams).catch((error) => {
    // Don't throw if an slug doesn't exist
    if (is404(error)) return
    throw error
  })
  const morePosts = (await api.posts.browse(moreObjectParams))
    ?.filter(({ slug }) => post.slug !== slug)
    .slice(0, 2)

  return {
    post,
    morePosts,
  }
}
