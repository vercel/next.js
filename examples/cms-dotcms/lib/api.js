async function fetchAPI(query, { variables, preview } = {}) {
  const res = await fetch(process.env.NEXT_PUBLIC_DOTCMS_HOST + '/api/v1/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.DOTCMS_TOKEN}`,
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
  // TODO: get preview post by slug
}

export async function getAllPostsWithSlug() {
  const entries = await fetchAPI(`
    query getAllPostsWithSlug {
      BlogCollection {
        urlTitle
      }
    }
  `);

  return entries?.BlogCollection ?? []
}

export async function getAllPostsForHome(preview) {
  const entries = await fetchAPI(`
    query getAllPostsForHome {
      BlogCollection {
        title
        teaser
        postingDate
        author {
          firstName
          lastName
          profilePhoto {
            idPath
          }
        }
        urlTitle
        image {
          idPath
        }
      }
    }
  `)

  return entries?.BlogCollection ?? []
}

export async function getPostAndMorePosts(slug, preview) {
  const data = await fetchAPI(`
    query PostBySlug($query: String!) {
      post: BlogCollection(query: $query, limit: 1) {
        title
        urlTitle
        body
        postingDate
        image {
          idPath
        }
        author {
          firstName
          lastName
          profilePhoto {
            idPath
          }
        }
      }
      
      morePosts: BlogCollection(limit: 2) {
        title
        urlTitle
        body
        postingDate
        image {
          idPath
        }
        author {
          firstName
          lastName
          profilePhoto {
            idPath
          }
        }
      }
    }
  `, {
    variables: {
      query: `urlTitle:${slug}`,
    }
  })

  return {
    post: data?.post[0] ?? {},
    morePosts: data?.morePosts ?? [],
  }
}
