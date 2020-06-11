async function fetchAPI(query, { variables } = {}, isAdminOnly = false) {
  const headers = {
    'Content-Type': 'application/json',
  }
  if (isAdminOnly) {
    headers['X-Hasura-Admin-Secret'] = process.env.HASURA_GRAPHQL_ADMIN_SECRET
  }
  const res = await fetch(`${process.env.HASURA_GRAPHQL_ENDPOINT}`, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
      query,
      variables,
    }),
  })

  const json = await res.json()
  if (json.errors) {
    console.error(json.errors)
    throw new Error('Failed to fetch')
  }

  return json.data
}

export async function getPreviewPostBySlug(slug) {
  const data = await fetchAPI(
    `
  query PostBySlug($slug: String!) {
    post(where: {slug: {_eq: $slug }}) {
      title
      slug
      excerpt
      date
      cover_image
      author {
        name
        picture
      }
    }
  }
  `,
    {
      variables: { slug },
    },
    true
  )
  return data?.post
}

export async function getAllPostsWithSlug() {
  const data = fetchAPI(
    `
    {
      post {
        slug
      }
    },
  `,
    {},
    true
  )
  return data?.post
}

export async function getAllPosts(preview) {
  const data = await fetchAPI(
    `
    query Posts($where: post_bool_exp){
      post(order_by: { date: desc }, limit: 10, where: $where) {
        title
        slug
        excerpt
        date
        cover_image
        author {
          name
          picture
        }
      }
    }
  `,
    {
      variables: {
        where: {
          ...(preview ? {} : { status: { _eq: 'published' } }),
        },
      },
    },
    preview ? true : false
  )
  return data?.post
}

export async function getPostBySlug(slug, preview) {
  const data = await fetchAPI(
    `
    query Post($slug: String!){
      post(where: { slug : {_eq: $slug }}) {
        title
        slug
        content
        excerpt
        date
        cover_image
        author {
          name
          picture
        }
      }
    }
  `,
    {
      variables: {
        slug: slug,
      },
    },
    preview ? true : false
  )
  return data?.post
}
