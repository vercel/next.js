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
      allPosts: getPostList {
        items {
          slug
        }
      }
    }
  `)
  return data?.allPosts?.items
}

export async function getAllPostsForHome(preview) {
  const data = await fetchAPI(
    `
    query MyQuery {
      posts(first: 20, where: { orderby: { field: DATE, order: DESC } }) {
        edges {
          node {
            title
            content
            slug
            featuredImage {
              sourceUrl
            }
            author {
              name
              avatar {
                url
              }
              firstName
              lastName
            }
            date
            excerpt
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

  console.log('POSTS', JSON.stringify(data, null, 2))

  return data?.posts
}

export async function getPostAndMorePosts(slug, preview) {
  const data = await fetchAPI(
    `
  query PostBySlug($slug: String, $onlyEnabled: Boolean) {
    post: getPostList(filter: { term: {slug: $slug}}, ${
      preview ? '' : 'where: { _status: { eq: "enabled" } },'
    } size: 1, onlyEnabled: $onlyEnabled) {
      items {
        title
        slug
        content
        date
        coverImage {
          path
        }
        author {
          name
          picture {
            path
          }
        }
      }
    }
    morePosts: getPostList(
      filter: { bool: { must_not: { term: {slug: $slug}}}}, , ${
        preview ? '' : 'where: { _status: { eq: "enabled" } },'
      }
      sort: { field: "date", order: "desc" }, size: 2, onlyEnabled: $onlyEnabled) {
      items {
        title
        slug
        excerpt
        date
        coverImage {
          path
        }
        author {
          name
          picture {
            path
          }
        }
      }
    }
  }
  `,
    {
      variables: {
        slug,
        onlyEnabled: !preview,
      },
    }
  )
  return data
}
