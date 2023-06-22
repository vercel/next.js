import Post from '../types/post'
import Author from '../types/author'
import PostAndMorePosts from "../types/postAndMorePosts"

const UMBRACO_SERVER_URL = process.env.UMBRACO_SERVER_URL;
const UMBRACO_DELIVERY_API_KEY = process.env.UMBRACO_DELIVERY_API_KEY;
const UMBRACO_API_URL = `${UMBRACO_SERVER_URL}/umbraco/delivery/api/v1.0/content`;

const fetchSingle = async (slug: string, startItem: string, preview: boolean) => 
    await performFetch(
        `${UMBRACO_API_URL}/item/${slug}`,
        {
          method: 'GET',
          headers: {
            'Start-Item': startItem,
            'Api-Key': UMBRACO_DELIVERY_API_KEY,
            'Preview': preview ? 'true' : 'false'
          }
        }
    );

const fetchMultiple = async (query: string, startItem: string, preview: boolean) => 
  await performFetch(
      `${UMBRACO_API_URL}/?${query}`,
      {
        method: 'GET',
        headers: {
          'Start-Item': startItem,
          'Api-Key': UMBRACO_DELIVERY_API_KEY,
          'Preview': preview ? 'true' : 'false'
        }
      }
  );

const performFetch = async (url: string, options: RequestInit) => {
  const response = await fetch(url, options)

  if (!response.ok) {
    const message = `Could not fetch data for URL: ${url} - response status was: ${response.status}`;
    throw new Error(message);
  }

  return await response.json();
}

const extractSlug = (item: any) : string => item.route.path;

const extractPost = (post: any) : Post => {
  // NOTE: author is an expanded property on the post
  const author = extractAuthor(post.properties.author);
  return {
    id: post.id,
    slug: extractSlug(post),
    title: post.name,
    coverImage: {
      url: `${UMBRACO_SERVER_URL}${post.properties.coverImage[0].url}`
    },
    date: post.updateDate,
    author: author,
    excerpt: post.properties.excerpt,
    content: post.properties.content.markup,
    tags: post.properties.tags
  }
}

const extractAuthor = (author: any) : Author => {
  return {
    id: author.id,
    name: author.name,
    picture: {
      url: `${UMBRACO_SERVER_URL}${author.properties.picture[0].url}`
    }
  }
}

const fetchPost = async (slug: string, preview: boolean) =>
    await fetchSingle(`${slug}?expand=property:author`, 'posts', preview);

const fetchPosts = async (expandAuthor: boolean, authorId: string, numberOfPosts: number, preview: boolean) => {
  const expand = expandAuthor ? 'property:author' : '';
  const filter = authorId ? `author:${authorId}` : '';
  const take = numberOfPosts ?? 10;
  return await fetchMultiple(`fetch=children:/&expand=${expand}&filter=${filter}&sort=updateDate:desc&take=${take}`, 'posts', preview);
}

export const getAllPostSlugs = async (preview: boolean) : Promise<string[]> => {
  const json = await fetchPosts(false, null, 100, preview);
  return json.items.map(post => extractSlug(post));
}

export const getAllPostsForHome = async (preview: boolean) : Promise<Post[]> => {
  const json = await fetchPosts(true, null, 10, preview);
  return json.items.map(extractPost);
}

export const getPostAndMorePosts = async (slug: string, preview: boolean) : Promise<PostAndMorePosts> => {
  const postJson = await fetchPost(slug, preview);
  const post = extractPost(postJson);
  const morePostsJson  = await fetchPosts(true, null, 3, preview);
  const morePosts = morePostsJson.items.map(extractPost);
  return {
    post: post,
    morePosts: morePosts.filter(p => p.id !== post.id).slice(0, 2)  
  };
}
