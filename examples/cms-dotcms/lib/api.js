// Dependencies
import { initDotCMS } from 'dotcms';

export const dotcms = initDotCMS({
    host: process.env.NEXT_PUBLIC_DOTCMS_HOST,
    token: process.env.DOTCMS_TOKEN,
});

async function fetchGraphQL(query, preview = false) {
  return fetch(
    `${process.env.NEXT_PUBLIC_DOTCMS_HOST}/api/v1/graphql`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.DOTCMS_TOKEN}`,
      },
      body: JSON.stringify({ query }),
    }
  ).then((response) => response.json())
}

export async function getPreviewPostBySlug(slug) {
  // TODO: get preview post by slug
}

export async function getAllPostsWithSlug() {
  // TODO: get all posts with slug
}

export async function getAllPostsForHome(preview) {
  const entries = await fetchGraphQL(`
    query ContentAPI {
      BlogCollection {
        title
        body
        postingDate
        author
      }
    }
  `)

  console.log(entries)
}

export async function getPostAndMorePosts(slug, preview) {
  // TODO: get post and more posts

  return {
    post: {},
    morePosts: [],
  }
}
