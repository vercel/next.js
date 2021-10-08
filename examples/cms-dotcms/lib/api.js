/**
 * A helper for the GraphQL API.
 * 
 * @param {String} query - The query to fetch for
 * @param {Object} param1.variables - The variables to pass to the query
 * @param {Object} param1.preview - Indicate if the query should be previewed
 * @returns {Promise} - A promise that resolves to the result of the query
 */
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

/**
 * Fetch all posts with slug
 * 
 * @returns An array of posts with the following shape:
 * {
 *  urlTitle: string
 * }
 */
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

/**
 * Fetch all posts
 * 
 * @param {String} preview - If true, return a preview of the post
 * @returns An array of posts
 */
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

/**
 * Fetch a single post and more posts
 * 
 * @param {String} slug - The slug of the post to fetch
 * @param {String} preview - Whether or not to fetch the preview post
 * @returns An object with a post and more posts array
 */
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
