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
  const entries = await fetchGraphQL(`
    query getAllPostsWithSlug {
      BlogCollection {
        urlTitle
      }
    }
  `);

  if (entries.errors) {
    console.error(entries.errors);

    return []
  }

  return entries?.data?.BlogCollection ?? []
}

export async function getAllPostsForHome(preview) {
  const entries = await fetchGraphQL(`
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

  if (entries.errors) {
    console.error(entries.errors);

    return []
  }

  return entries?.data?.BlogCollection ?? []
}

export async function getPostAndMorePosts(slug, preview) {
  // TODO: get post and more posts

  return {
    post: {},
    morePosts: [],
  }
}
