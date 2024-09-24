const API_URL = `https://api.takeshape.io/project/${process.env.TAKESHAPE_PROJECT_ID}/graphql`;
const API_KEY = process.env.TAKESHAPE_API_KEY;

async function fetchAPI(query, { variables } = {}) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  const json = await res.json();
  if (json.errors) {
    console.error(json.errors);
    throw new Error("Failed to fetch API");
  }
  return json.data;
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
    },
  );
  return (data?.post?.items || [])[0];
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
  `);
  return data?.allPosts?.items;
}

export async function getAllPostsForHome(preview) {
  const data = await fetchAPI(
    `
    query AllPosts($onlyEnabled: Boolean) {
      allPosts: getPostList(sort: { field: "date", order: "desc" }, size: 20, onlyEnabled: $onlyEnabled) {
        items {
          slug
          title
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
        onlyEnabled: !preview,
        preview,
      },
    },
  );
  return data?.allPosts?.items;
}

export async function getPostAndMorePosts(slug, preview) {
  const data = await fetchAPI(
    `
  query PostBySlug($slug: String, $onlyEnabled: Boolean) {
    post: getPostList(filter: { term: {slug: $slug}}, ${
      preview ? "" : 'where: { _status: { eq: "enabled" } },'
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
        preview ? "" : 'where: { _status: { eq: "enabled" } },'
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
    },
  );
  return data;
}
