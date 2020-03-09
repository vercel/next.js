import 'isomorphic-unfetch'
import Prismic from 'prismic-javascript'

const REPOSITORY = 'hello-world-test-12345'
const REF_API_URL = `https://${REPOSITORY}.cdn.prismic.io/api/v2`
const GRAPHQL_API_URL = `https://${REPOSITORY}.cdn.prismic.io/graphql`
// export const API_URL = 'https://your-repo-name.cdn.prismic.io/api/v2'
export const API_TOKEN = process.env.NEXT_EXAMPLE_CMS_PRISMIC_API_TOKEN

const PrismicClient = Prismic.client(REF_API_URL, { accessToken: API_TOKEN })

async function fetchAPI(query, { preview, variables } = {}) {
  const prismicAPI = await PrismicClient.getApi()
  const res = await fetch(
    `${GRAPHQL_API_URL}?query=${query}&variables=${JSON.stringify(variables)}`,
    {
      headers: {
        'Prismic-Ref': prismicAPI.masterRef.ref,
        'Content-Type': 'application/json',
        Authorization: `Token ${API_TOKEN}`,
      },
    }
  )

  if (res.status !== 200) {
    console.log(await res.text())
    throw new Error('Failed to fetch API')
  }

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
    query PostBySlug($slug: String!) {
      post(uid: $slug lang: "en-us") {
        _meta {
          uid
        }
      }
    }`,
    {
      preview: true,
      variables: {
        slug,
      },
    }
  )
  return data?.post
}

export async function getAllPostsWithSlug() {
  const data = await fetchAPI(`
    {
      allPosts {
        edges {
          node {
            _meta {
              uid
            }
          }
        }
      }
    }
  `)
  return data?.allPosts?.edges
}

export async function getAllPostsForHome(preview) {
  const data = await fetchAPI(
    `
    query {
      allPosts {
        edges {
          node {
            date
            title
            content
            coverimage
            _meta {
              uid
            }
          }
        }
      }
    }
  `,
    { preview }
  )

  return data.allPosts.edges
}

export async function getPostAndMorePosts(slug, preview) {
  const data = await fetchAPI(
    `
  query PostBySlug($slug: String!) {
    post(uid: $slug lang: "en-us") {
      title
      content
      date
      coverimage
      _meta {
        uid
      }
    }
  }
  `,
    {
      preview,
      variables: {
        slug,
      },
    }
  )
  return data
}
