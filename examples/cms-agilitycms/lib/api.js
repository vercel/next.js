import agility from '@agility/content-fetch'
import { CMS_LANG } from './constants'
import crypto from 'crypto'

//Our LIVE API client
const agilityContentFetch = agility.getApi({
  guid: process.env.NEXT_EXAMPLE_CMS_AGILITY_GUID,
  apiKey: process.env.NEXT_EXAMPLE_CMS_AGILITY_API_FETCH_KEY,
})

//Our PREVIEW API client
const agilityContentPreview = agility.getApi({
  guid: process.env.NEXT_EXAMPLE_CMS_AGILITY_GUID,
  apiKey: process.env.NEXT_EXAMPLE_CMS_AGILITY_API_PREVIEW_KEY,
  isPreview: true
})

//Get all Post slugs
export async function getAllPostsWithSlug() {
  const data = await getAllPosts(agilityContentFetch);

  const allPostSlugs = data.map((p) => {
    return { slug: p.fields.slug };
  })

  console.log('slugs', allPostSlugs)
  return allPostSlugs;
}

//Normalizes our data that we get back from Agility CMS
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

//Gets all the posts for the homepage
export async function getAllPostsForHome(preview) {

  const client = (preview ? agilityContentPreview : agilityContentFetch);

  const data = await getAllPosts(client, 20);
  
  const normalizedPosts = normalizePosts(data);
  
  return normalizedPosts;
}


//Gets the post and other posts for the post details page
export async function getPostAndMorePosts(slug, preview) {
  
  const client = (preview ? agilityContentPreview : agilityContentFetch);

  const postsThatMatchSlug = await client.getContentList({
    referenceName: `posts`,
    languageCode: CMS_LANG,
    contentLinkDepth: 1,
    take: 1,
    filters: [
      { property: 'fields.slug', operator: client.types.FilterOperators.EQUAL_TO, value: `"${slug}"` }
    ]
  })
  
  const thisPost = postsThatMatchSlug.items[0];

  if(!thisPost) {
    console.error(`Could not find post with slug '${slug}'`);
  }

  const allPosts = await getAllPosts(client, 20);

  const postsLessThisPost = allPosts.filter((p) => {
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

//Validates whether the incoming preview request is valid
export async function validatePreview({ agilityPreviewKey, slug }) {
  //Validate the preview key
  if(!agilityPreviewKey) {
    return {
      error: true,
      message: `Missing agilitypreviewkey.`
    }
  }

  //sanitize incoming key (replace spaces with '+')
  if(agilityPreviewKey.indexOf(` `) > -1) {
    agilityPreviewKey = agilityPreviewKey.split(` `).join(`+`);
  }

  //compare the preview key being used
  const correctPreviewKey = generatePreviewKey();

  if(agilityPreviewKey !== correctPreviewKey) {
    return {
      error: true,
      message: `Invalid agilitypreviewkey.`
      //message: `Invalid agilitypreviewkey. Incoming key is=${agilityPreviewKey} compared to=${correctPreviewKey}...`
    }
  }

  const validateSlugResponse = await getPreviewPostBySlug({ slug });
  
  if(validateSlugResponse.error) {
    //kickout
    return validateSlugResponse;
  }

  //return success
  return {
    error: false,
    message: null,
    slug: validateSlugResponse.slug
  }

}

//Generates a preview key to compare agains
export function generatePreviewKey() {
  //the string we want to encode
  const str = `-1_${process.env.NEXT_EXAMPLE_CMS_AGILITY_SECURITY_KEY}_Preview`;

  //build our byte array
  let data = [];
  for (var i = 0; i < str.length; ++i)
  {
      data.push(str.charCodeAt(i));
      data.push(0);
  }
  
  //convert byte array to buffer
  const strBuffer = Buffer.from(data);

  //encode it!
  const previewKey = crypto.createHash('sha512').update(strBuffer).digest('base64');
  return previewKey;
}

//Checks if the specific slug is a valid post
export async function getPreviewPostBySlug({ slug }) {

  slug = slug.substring(slug.lastIndexOf('/') + 1);

  //Check that the requested page exists
  const posts = await getAllPosts(agilityContentPreview, 50);

  const slugs = posts.map((p) => {
    return p.fields.slug;
  });


  //if we are trying to preview a page that does not exist, default to '/'
  if(!slugs.includes(slug)) {
    slug = '/'
  } else {
    //pre-pend the path for posts
    slug = `/posts/${slug}`;
  }

  return {
    error: false,
    message: null,
    slug: slug
  }
}

//Retrieves all Posts 
async function getAllPosts(client, take) {
  const data = await client.getContentList({
    referenceName: `posts`,
    languageCode: CMS_LANG,
    contentLinkDepth: 1,
    take: take //TODO: Implement paging...
  })

  return data.items;
}


