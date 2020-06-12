import Cosmic from 'cosmicjs'

const GRAPHQL_API_URL = process.env.SHOPIFY_GRAPHQL_API_URL
const BUCKET_SLUG = process.env.NEXT_EXAMPLE_CMS_COSMIC_BUCKET_SLUG
const READ_KEY = process.env.NEXT_EXAMPLE_CMS_COSMIC_READ_KEY

const bucket = Cosmic().bucket({
  slug: BUCKET_SLUG,
  read_key: READ_KEY,
})

const is404 = (error) => /not found/i.test(error.message)

async function fetchAPI(query, { variables = {} } = {}) {
  const res = await fetch(GRAPHQL_API_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token':
        process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN,
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  })

  if (res.status !== 200) {
    console.error(await res.text())
    throw new Error('Failed to fetch API')
  }

  const json = await res.json()

  if (json.errors) {
    console.error(json.errors)
    throw new Error('Failed to fetch API')
  }

  return json.data
}

export async function getShopDataForHome() {
  const data = await fetchAPI(`
    {
      shop {
        name
      }
      products(first: 10) {
        edges {
          node {
            id
            title
            description
            handle
            images(first: 3) {
              edges {
                node {
                  altText
                  originalSrc
                }
              }
            }
            priceRange {
              maxVariantPrice {
                amount
                currencyCode
              }
              minVariantPrice {
                amount
                currencyCode
              }
            }
            variants(first: 10) {
              edges {
                node {
                  id
                  title
                  priceV2 {
                    amount
                    currencyCode
                  }
                  selectedOptions {
                    name
                    value
                  }
                  image {
                    altText
                    originalSrc
                    transformedSrc(maxHeight: 416, maxWidth: 416, crop: CENTER)
                  }
                }
              }
            }
          }
        }
      }
    }
  `)

  return data
}

export async function getPreviewPostBySlug(slug) {
  const params = {
    slug,
    props: 'slug',
    status: 'all',
  }

  try {
    const data = await bucket.getObject(params)
    return data.object
  } catch (error) {
    // Don't throw if an slug doesn't exist
    if (is404(error)) return
    throw error
  }
}

export async function getAllPostsWithSlug() {
  const params = {
    type: 'posts',
    props: 'slug',
  }
  const data = await bucket.getObjects(params)
  return data.objects
}

export async function getAllPostsForHome(preview) {
  const params = {
    type: 'posts',
    props: 'title,slug,metadata,created_at',
    ...(preview && { status: 'all' }),
  }
  const data = await bucket.getObjects(params)
  return data.objects
}

export async function getPostAndMorePosts(slug, preview) {
  const singleObjectParams = {
    slug,
    props: 'slug,title,metadata,created_at',
    ...(preview && { status: 'all' }),
  }
  const moreObjectParams = {
    type: 'posts',
    limit: 3,
    props: 'title,slug,metadata,created_at',
    ...(preview && { status: 'all' }),
  }
  const object = await bucket.getObject(singleObjectParams).catch((error) => {
    // Don't throw if an slug doesn't exist
    if (is404(error)) return
    throw error
  })
  const moreObjects = await bucket.getObjects(moreObjectParams)
  const morePosts = moreObjects.objects
    ?.filter(({ slug: object_slug }) => object_slug !== slug)
    .slice(0, 2)

  return {
    post: object?.object,
    morePosts,
  }
}
