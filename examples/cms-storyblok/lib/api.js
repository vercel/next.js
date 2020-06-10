async function fetchAPI(query, { variables, preview } = {}) {
  const res = await fetch('https://gapi.storyblok.com/v1/api', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Token: process.env.NEXT_EXAMPLE_CMS_STORYBLOK_API_KEY,
      Version: preview ? 'draft' : 'published',
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
  const post = await fetchAPI(
    `
  query PostBySlug($slug: ID!) {
    PostItem(id: $slug) {
      slug
    }
  }
  `,
    {
      preview: true,
      variables: {
        slug: `posts/${slug}`,
      },
    }
  )
  return post
}

export async function getAllPostsWithSlug() {
  const data = await fetchAPI(`
    {
      PostItems {
        items {
          slug
        }
      }
    }
  `)
  return data?.PostItems.items
}

export async function getAllPostsForHome(preview) {
  const data = await fetchAPI(
    `
    {
      PostItems {
        items {
          slug
          published_at
          content {
            long_text
            intro
            title
            image
            author {
              name
              content
            }
          }
        }
      }
    }
  `,
    { preview }
  )
  return data?.PostItems.items
}

export async function getPostAndMorePosts(slug, preview) {
  const post = await fetchAPI(
    `
  query PostBySlug($slug: ID!) {
    PostItem(id: $slug) {
      slug
      published_at
      id
      content {
        long_text
        intro
        title
        image
        author {
          name
          content
        }
      }
    }
  }
  `,
    {
      preview,
      variables: {
        slug: `posts/${slug}`,
      },
    }
  )
  const morePosts = post?.PostItem?.id
    ? await fetchAPI(
        `
  query PostBySlug($id: String) {
    PostItems(excluding_ids: $id, per_page: 2) {
      items {
        slug
        published_at
        content {
          long_text
          intro
          title
          image
          author {
            name
            content
          }
        }
      }
    }
  }
  `,
        {
          preview,
          variables: {
            id: `${post.PostItem.id}`,
          },
        }
      )
    : {}

  return {
    post: post?.PostItem,
    morePosts: morePosts?.PostItems?.items || [],
  }
}
