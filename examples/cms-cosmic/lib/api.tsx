import Cosmic from 'cosmicjs'
import { PostType } from 'interfaces'
import ErrorPage from 'next/error'

const BUCKET_SLUG = process.env.COSMIC_BUCKET_SLUG
const READ_KEY = process.env.COSMIC_READ_KEY

const bucket = Cosmic().bucket({
  slug: BUCKET_SLUG,
  read_key: READ_KEY,
})

export const getPreviewPostBySlug = async (slug: string) => {
  const params = {
    query: {
      slug,
      type: 'posts',
    },
    props: 'slug',
    status: 'any',
  }

  try {
    const data = await bucket.getObjects(params)
    return data.objects[0]
  } catch (err) {
    // Don't throw if an slug doesn't exist
    return <ErrorPage statusCode={err.status} />
  }
}

export const getAllPostsWithSlug = async () => {
  const params = {
    query: {
      type: 'posts',
    },
    props: 'slug',
  }
  const data = await bucket.getObjects(params)
  return data.objects
}

export const getAllPostsForHome = async (preview: boolean): Promise<Post[]> => {
  const params = {
    query: {
      type: 'posts',
    },
    props: 'title,slug,metadata,created_at',
    sort: '-created_at',
    ...(preview && { status: 'any' }),
  }
  const data = await bucket.getObjects(params)
  return data.objects
}

export const getPostAndMorePosts = async (
  slug: string,
  preview: boolean
): Promise<{
  post: PostType
  morePosts: PostType[]
}> => {
  const singleObjectParams = {
    query: {
      slug,
      type: 'posts',
    },
    props: 'slug,title,metadata,created_at',
    ...(preview && { status: 'any' }),
  }
  const moreObjectParams = {
    query: {
      type: 'posts',
    },
    limit: 3,
    props: 'title,slug,metadata,created_at',
    ...(preview && { status: 'any' }),
  }
  let object
  try {
    const data = await bucket.getObjects(singleObjectParams)
    object = data.objects[0]
  } catch (err) {
    throw err
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
