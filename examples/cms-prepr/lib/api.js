async function fetchAPI(query, { variables, preview } = {}) {
  const response = await fetch(process.env.PREPRIO_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:
        "Bearer " +
        (preview
          ? process.env.PREPRIO_PREVIEW_TOKEN
          : process.env.PREPRIO_PRODUCTION_TOKEN),
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  const result = await response.json();

  return result;
}

export async function getPreviewPostBySlug(slug) {
  const { data } = await fetchAPI(
    `
  query ArticleBySlug($slug: String!) {
    Article(slug: $slug) {
      _slug
    }
  }
  `,
    {
      preview: true,
      variables: {
        slug,
      },
    },
  );
  return data.Article;
}

export async function getAllPostsWithSlug() {
  const { data } = await fetchAPI(
    `
    {
      Articles {
        items {
          _slug
        }
      }
    }
  `,
    { preview: true },
  );
  return data?.Articles.items;
}

export async function getAllPostsForHome(preview) {
  const { data } = await fetchAPI(
    `
    {
      Articles(sort: publish_on_DESC) {
        items {
          _id
          _slug
          _publish_on
          title
          excerpt
          content {
            ...on Text {
              html
              text
            }
          }
          authors {
            full_name
            profile_pic {
              url
            }
          }
          cover {
            url(preset: "square")
          }
        }
      }
    }
  `,
    { preview },
  );

  return data?.Articles.items;
}

export async function getPostAndMorePosts(slug, preview) {
  const { data } = await fetchAPI(
    `
  query ArticlesBySlug($slug: String!) {
    Article(slug: $slug) {
      _id
      _slug
      _publish_on
      title
      excerpt
      content {
        __typename
        ... on Text {
          html
          text
        }
        ... on Assets {
          items {
            url
          }
        }
      }
      authors {
        full_name
        profile_pic {
          url
        }
      }
      cover {
        url(preset: "square")
      }
    }
    MoreArticles: Articles(limit: 3, sort: publish_on_DESC) {
      items {
        _id
        _slug
        _publish_on
        title
        excerpt
        cover {
          url(preset: "square")
        }
        content {
          ... on Text {
            html
            text
          }
        }
        authors {
          full_name
          profile_pic {
            url
          }
        }
      }
    }
  }
  `,
    {
      preview,
      variables: {
        slug,
      },
    },
  );

  return {
    post: data?.Article,
    morePosts: (data?.MoreArticles?.items || [])
      .filter((item) => item._slug !== slug)
      .slice(0, 2),
  };
}
