async function fetchAPI(query, { variables, preview } = {}) {
  const response = await fetch(process.env.PREPRIO_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:
        'Bearer ' +
        (preview
          ? process.env.PREPRIO_PREVIEW_TOKEN
          : process.env.PREPRIO_PRODUCTION_TOKEN),
    },
    body: JSON.stringify({ query, variables }),
  })

  const result = await response.json()

  if (result.errors) {
    console.error('Prepr GraphQL errors:', JSON.stringify(result.errors))
  }

  return result.data
}

// Posts are stored with a "blog/" prefixed slug, but routes use the bare slug.
export const toRouteSlug = (slug) => (slug || '').replace(/^blog\//, '')
export const toApiSlug = (slug) =>
  slug?.startsWith('blog/') ? slug : `blog/${slug}`

const POST_FIELDS = `
  _id
  _slug
  _publish_on
  _read_time
  title
  excerpt
  cover {
    url
  }
  author {
    name
    image {
      url
    }
  }
  categories {
    name
  }
`

export async function getPreviewPostBySlug(slug) {
  const data = await fetchAPI(
    `
    query PostBySlug($slug: String!) {
      Post(slug: $slug) {
        _slug
      }
    }
  `,
    { preview: true, variables: { slug: toApiSlug(slug) } }
  )
  return data?.Post
}

export async function getAllSlugs() {
  const data = await fetchAPI(`
    {
      Posts {
        items {
          _slug
        }
      }
    }
  `)
  return data?.Posts?.items || []
}

export async function getAllPostsForHome(preview) {
  const data = await fetchAPI(
    `
    {
      Posts(sort: publish_on_DESC) {
        items {
          ${POST_FIELDS}
        }
      }
    }
  `,
    { preview }
  )
  return data?.Posts?.items || []
}

export async function getPostAndMorePosts(slug, preview) {
  const data = await fetchAPI(
    `
    query PostBySlug($slug: String!) {
      Post(slug: $slug) {
        ${POST_FIELDS}
        content {
          __typename
          ... on Text {
            html
          }
          ... on Assets {
            items {
              url
            }
          }
        }
      }
      MorePosts: Posts(limit: 3, sort: publish_on_DESC) {
        items {
          ${POST_FIELDS}
        }
      }
    }
  `,
    { preview, variables: { slug: toApiSlug(slug) } }
  )

  return {
    post: data?.Post || null,
    morePosts: (data?.MorePosts?.items || [])
      .filter((item) => item._slug !== toApiSlug(slug))
      .slice(0, 2),
  }
}
