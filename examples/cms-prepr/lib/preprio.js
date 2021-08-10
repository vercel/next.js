import { createPreprClient } from '@preprio/nodejs-sdk'

const prepr = createPreprClient({
  token: process.env.PREPRIO_PRODUCTION_TOKEN,
  timeout: 4000,
  baseUrl: process.env.PREPRIO_API,
})

export { prepr }

export async function getAllPostsForHome(preview) {
  // Query publications
  const data =
    (await prepr
      .graphqlQuery(
        `
      query {
        Posts {
          items {
            _id,
            _slug,
            date: _publish_on
            title,
            summary,
            author {
                name
                cover {
                    cdn_files {
                        url(width: 100, height:100)
                    }
                }
            }
            cover {
                cdn_files {
                    url(width:2000, height:1000)
                }
            }
          }
        }
      }`
      )
      .token(
        preview
          ? process.env.PREPRIO_PREVIEW_TOKEN
          : process.env.PREPRIO_PRODUCTION_TOKEN
      )
      .fetch()) || []

  return data.data.Posts.items
}

export async function getAllPostsWithSlug() {
  // Query publications
  const data =
    (await prepr
      .graphqlQuery(
        `
      query {
        Posts {
          items {
            slug : _slug,
          }
        }
      }`
      )
      .fetch()) || []

  return data.data.Posts.items
}

export async function getPostAndMorePosts(slug, preview) {
  // Query publications
  const data =
    (await prepr
      .graphqlQuery(
        `
      query slugPost($slug: String!) {
        Post ( slug : $slug) {
            _id,
            _slug,
            date: _publish_on
            title,
            summary,
            content,
            author {
                name
                cover {
                    cdn_files {
                        url(width: 100, height:100)
                    }
                }
            }
            cover {
                cdn_files {
                    url(width:2000, height:1000)
                }
            }
          }
        morePosts : Posts(where : { _slug_nany : [$slug] }) {
          items {
            _id,
            _slug,
            date: _publish_on
            title,
            summary,
            author {
                name
                cover {
                    cdn_files {
                        url(width: 100, height:100)
                    }
                }
            }
            cover {
                cdn_files {
                    url(width:2000, height:1000)
                }
            }
          }
        }          
      }`
      )
      .graphqlVariables({
        slug: slug,
      })
      .token(
        preview
          ? process.env.PREPRIO_PREVIEW_TOKEN
          : process.env.PREPRIO_PRODUCTION_TOKEN
      )
      .fetch()) || []

  return data.data
}

export async function getPreviewPostBySlug(slug) {
  // Query publications
  const data =
    (await prepr
      .graphqlQuery(
        `
      query preview($slug: String!) {
        Post ( slug : $slug) {
            _id,
            slug : _slug
          }          
      }`
      )
      .token(process.env.PREPRIO_PREVIEW_TOKEN)
      .graphqlVariables({
        slug: slug,
      })
      .fetch()) || []

  return data.data.Post
}
