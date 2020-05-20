const API_URL = 'https://vercel.wpengine.com/graphql'

async function fetchAPI(query, { variables } = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  })

  const json = await res.json()
  if (json.errors) {
    console.error(json.errors)
    throw new Error('Failed to fetch API')
  }
  return json.data
}

export async function getPreviewPostBySlug(slug) {
  const data = await fetchAPI(
    `
    query PostBySlug($slug: String) {
      post: getPostList(filter: {term: {slug: $slug}}, size: 1, onlyEnabled: false) {
        items {
          slug
        }
      }
    }`,
    {
      variables: {
        slug,
      },
    }
  )
  return (data?.post?.items || [])[0]
}

export async function getAllPostsWithSlug() {
  const data = await fetchAPI(`
    {
      posts(first: 10000) {
        edges {
          node {
            slug
          }
        }
      }
    }
  `)
  return data?.posts
}

export async function getAllPostsForHome(preview) {
  const data = await fetchAPI(
    `
    query AllPosts {
      posts(first: 20, where: { orderby: { field: DATE, order: DESC } }) {
        edges {
          node {
            title
            content
            excerpt
            slug
            featuredImage {
              sourceUrl
            }
            author {
              name
              firstName
              lastName
              avatar {
                url
              }
            }
            date
          }
        }
      }
    }
  `,
    {
      variables: {
        onlyEnabled: !preview,
        preview,
      },
    }
  )

  return data?.posts
}

export async function getPostAndMorePosts(slug, preview) {
  const data = await fetchAPI(
    `
    query PostBySlug($slug: ID!) {
      post(id: $slug, idType: SLUG) {
        title
        content
        excerpt
        slug
        featuredImage {
          sourceUrl
        }
        author {
          name
          firstName
          lastName
          avatar {
            url
          }
        }
        date
      }
      posts(first: 4, where: { orderby: { field: DATE, order: DESC } }) {
        edges {
          node {
            title
            excerpt
            slug
            featuredImage {
              sourceUrl
            }
            author {
              name
              firstName
              lastName
              avatar {
                url
              }
            }
            date
          }
        }
      }
    }
  `,
    { variables: { slug } }
  )

  console.log('POSTS', JSON.stringify(data, null, 2))

  return data
}
