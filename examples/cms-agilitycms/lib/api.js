import agility from '@agility/content-fetch'
import { CMS_LANG } from './constants'

const agilityContentFetch = agility.getApi({
  guid: process.env.AGILITY_GUID,
  apiKey: process.env.AGILITY_API_FETCH_KEY,
})


export async function getPreviewPostBySlug(slug) {
  const data = await fetchAPI(
    `
    query PostBySlug($slug: String) {
      post(filter: {slug: {eq: $slug}}) {
        slug
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
  const data = await agilityContentFetch.getContentList({
    referenceName: `posts`,
    languageCode: CMS_LANG,
    contentLinkDepth: 1,
    take: 50 //TODO: Implement paging...
  })
  const allPostSlugs = data.items.map((p) => {
    return { slug: p.fields.slug };
  })

  console.log('slugs', allPostSlugs)
  return allPostSlugs;
}

function normalizePosts(postsFromAgility) {
  /* Need an object like this...
    - title
    - slug
    - excerpt
    - date
    - coverImage
      - responsiveImage
    - author
      - name
      - picture
          - url
  */

  const posts = postsFromAgility.map((p) => {
    return {
      title: p.fields.title,
      slug: p.fields.slug,
      excerpt: p.fields.excerpt,
      date: p.fields.date,
      content: p.fields.content,
      ogImage: {
        url: `${p.fields.coverImage.url}?w=2000&h=1000&q=70`
      },
      coverImage: {
        responsiveImage: {
          srcSet: null,
          webpSrcSet: null,
          sizes: null,
          src: `${p.fields.coverImage.url}?w=2000&h=1000&q=70`,
          width: 2000,
          height: 1000,
          aspectRatio: 100,
          base64: null,
          alt: p.fields.coverImage.label,
          title: null,
          bgColor: null          
        }
      },
      author: {
        name: p.fields.author.fields.name,
        picture: {
          url: `${p.fields.author.fields.picture.url}?w=100&h=100`
        }
      }
    }
  });

  return posts;
}

export async function getAllPostsForHome(preview) {

  const data = await agilityContentFetch.getContentList({
    referenceName: `posts`,
    languageCode: CMS_LANG,
    contentLinkDepth: 1,
    take: 20
  })
  
  const normalizedPosts = normalizePosts(data.items);
  
  return normalizedPosts;
}



export async function getPostAndMorePosts(slug, preview) {
  
  const postsThatMatchSlug = await agilityContentFetch.getContentList({
    referenceName: `posts`,
    languageCode: CMS_LANG,
    contentLinkDepth: 1,
    take: 20,
    filters: [
      { property: 'fields.slug', operator: agilityContentFetch.types.FilterOperators.EQUAL_TO, value: `"${slug}"` }
    ]
  })
  
  const thisPost = postsThatMatchSlug.items[0];

  if(!thisPost) {
    console.error(`Could not find post with slug '${slug}'`);
  }

  const allPosts = await agilityContentFetch.getContentList({
    referenceName: `posts`,
    languageCode: CMS_LANG,
    contentLinkDepth: 1,
    take: 20
  })

  const postsLessThisPost = allPosts.items.filter((p) => {
    return p.slug !== thisPost.slug;
  })
 
  const normalizedMorePosts = normalizePosts(postsLessThisPost);
  const thisNormalizedPost = normalizePosts([ thisPost ])[0];

  const data = {
    post: thisNormalizedPost,
    morePosts: normalizedMorePosts
  }

  return data;
}
