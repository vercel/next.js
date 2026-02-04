import PostType from "../interfaces/post";

export async function executeGraphQLForBlogPosts(
  query: string,
): Promise<CmsPost[]> {
  const graphQLEndpoint = `${process.env.SF_API_URL}graphql`;
  const response = await fetch(graphQLEndpoint, {
    method: "POST",
    body: JSON.stringify({ query }),
    headers: { "Content-Type": "application/json" },
  }).then((x) => x.json());
  return response["data"]["posts"];
}

export async function getAllPostSlugsFromCms(): Promise<string[]> {
  var query = `
        query {
            posts {
                itemDefaultUrl
            }
        }
    `;

  const blogPosts = await executeGraphQLForBlogPosts(query);
  const slugs = blogPosts.map((x) => x.itemDefaultUrl);
  return slugs;
}

function transformImageUrl(url: string) {
  if (!url.startsWith("http")) {
    url = process.env.SF_URL + url.substring(1);
  }

  return url;
}

function mapCmsBlog(source: CmsPost): PostType {
  return {
    content: source.content,
    excerpt: source.excerpt,
    date: source.dateCreated,
    slug: source.itemDefaultUrl,
    title: source.title,
    author: {
      name: source.authorOfPost[0].title,
      picture: transformImageUrl(source.authorOfPost[0].picture[0].url),
    },
    coverImage: transformImageUrl(source.coverImage[0].url),
    ogImage: {
      url: transformImageUrl(source.openGraphImage[0].url),
    },
  };
}

export async function getPostBySlugFromCms(slug: string): Promise<PostType> {
  const modifiedSlug = slug;
  var query = `
        query {
            posts(_filter: {itemDefaultUrl: {_eq: "${modifiedSlug}"}}) {
                id
                title
                excerpt
                content
                dateCreated
                itemDefaultUrl
                openGraphImage {
                    url
                }
                coverImage {
                    url
                }
                authorOfPost {
                    title
                    picture {
                        url
                    }
                }
            }
        }
    `;

  const blogPosts = (await executeGraphQLForBlogPosts(query)).map((x) =>
    mapCmsBlog(x),
  );
  if (blogPosts.length > 0) return blogPosts[0];

  return null;
}

export async function getAllPostsFromCms(): Promise<PostType[]> {
  var query = `
        query {
            posts {
                id
                title
                excerpt
                content
                dateCreated
                itemDefaultUrl
                openGraphImage {
                    url
                }
                coverImage {
                    url
                }
                authorOfPost {
                    title
                    picture {
                        url
                    }
                }
            }
        }
    `;

  const blogPosts = (await executeGraphQLForBlogPosts(query)).map((x) =>
    mapCmsBlog(x),
  );
  return blogPosts;
}

interface CmsPost {
  title: string;
  excerpt: string;
  dateCreated: string;
  content: string;
  itemDefaultUrl: string;
  openGraphImage: {
    url: string;
  };
  coverImage: {
    url: string;
  };
  authorOfPost: {
    title: string;
    picture: {
      url: string;
    };
  };
}
