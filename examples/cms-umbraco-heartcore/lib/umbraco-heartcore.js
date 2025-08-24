async function fetchAPI(query, { variables, preview } = {}) {
  const res = await fetch("https://graphql.umbraco.io", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Api-Key": process.env.UMBRACO_API_KEY,
      "Umb-Project-Alias": process.env.UMBRACO_PROJECT_ALIAS,
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
    query PostBySlug($slug: String!) {
      post(url: $slug, preview: true) {
        slug:url
      }
    }`,
    {
      preview: true,
      variables: {
        slug,
      },
    },
  );
  return data.post;
}

export async function getAllPostsWithSlug() {
  const data = await fetchAPI(`
    {
      allPost {
        edges {
          node {
            slug:url
          }
        }
      }
    }
  `);
  return data.allPost.edges.map((x) => x.node);
}

export async function getAllPostsForHome(preview) {
  const data = await fetchAPI(
    `
    query ($preview: Boolean) {
      allPost(first: 20, orderBy: [date_DESC], preview: $preview) {
        edges {
          node {
            title:name
            slug:url
            excerpt
            date
            coverImage {
              url(width: 2000, height: 1000, cropMode: CROP, upscale: true)
            }
            author {
              ...on Author {
                name
                picture {
                  url(width: 100, height: 100, cropMode: CROP, upscale: true)
                }
              }
            }
          }
        }
      }
    }
  `,
    {
      preview,
      variables: {
        preview,
      },
    },
  );
  return data.allPost.edges.map((e) => e.node);
}

export async function getPostAndMorePosts(slug, preview) {
  const data = await fetchAPI(
    `
    query PostBySlug($slug: String!, $preview: Boolean!) {
      post(url: $slug, preview: $preview) {
        title:name
        slug:url
        content:bodyText
        date
        ogImage: coverImage {
            url(width: 2000, height: 1000, cropMode: CROP, upscale: true)
        }
        coverImage {
            url(width: 2000, height: 1000, cropMode: CROP, upscale: true)
        }
        author {
          ...on Author {
            name
            picture {
              url(width: 100, height: 100, cropMode: CROP, upscale: true)
            }
          }
        }
      }
      morePosts: allPost(first: 2, where: { NOT: { url: $slug } }, orderBy: [date_DESC], preview: $preview) {
        edges {
          node {
            title:name
            slug:url
            excerpt
            date
            coverImage {
              url(width: 2000, height: 1000, cropMode: CROP, upscale: true)
            }
            author {
              ...on Author {
                name
                picture {
                  url(width: 100, height: 100, cropMode: CROP, upscale: true)
                }
              }
            }
          }
        }
      }
    }
  `,
    {
      preview,
      variables: {
        preview,
        slug: `/${slug.join("/")}/`,
      },
    },
  );
  return {
    post: data.post,
    morePosts: data.morePosts.edges.map((e) => e.node),
  };
}
