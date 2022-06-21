import Cosmic from 'cosmicjs'
import ErrorPage from 'next/error'

const BUCKET_SLUG = process.env.COSMIC_BUCKET_SLUG
const READ_KEY = process.env.COSMIC_READ_KEY

const bucket = Cosmic().bucket({
  slug: BUCKET_SLUG,
  read_key: READ_KEY,
})

export async function getPreviewPostBySlug(slug) {
  const params = {
    query: {
      slug,
      type: 'posts',
    },
    props: 'slug',
    status: 'all',
  }

  try {
    const data = await bucket.getObjects(params)
    return data.objects[0]
  } catch (err) {
    // 404 if slug not found
    return <ErrorPage statusCode={err.status} />
  }
}

export async function getAllPostsWithSlug() {
  const params = {
    query: {
      type: 'posts',
    },
    props: 'slug',
  }
  const data = await bucket.getObjects(params)
  return data.objects
}

export async function getAllPostsForHome(preview) {
  const params = {
    query: {
      type: 'posts',
    },
    props: 'title,slug,metadata,created_at',
    sort: '-created_at',
    ...(preview && { status: 'all' }),
  }
  const data = await bucket.getObjects(params)
  return data.objects
}

export async function getPostAndMorePosts(slug, preview) {
  const singleObjectParams = {
    query: {
      slug,
      type: 'posts',
    },
    props: 'slug,title,metadata,created_at',
    ...(preview && { status: 'all' }),
  }
  const moreObjectParams = {
    query: {
      type: 'posts',
    },
    limit: 3,
    props: 'title,slug,metadata,created_at',
    ...(preview && { status: 'all' }),
  }
  let object
  try {
    const data = await bucket.getObjects(singleObjectParams)
    object = data.objects[0]
  } catch (err) {
    // 404 if slug not found
    return <ErrorPage statusCode={err.status} />
  }
  const moreObjects = await bucket.getObjects(moreObjectParams)
  const morePosts = moreObjects.objects
    ?.filter(({ slug: object_slug }) => object_slug !== slug)
    .slice(0, 2)

  return {
    post: object,
    morePosts,
  }
}
