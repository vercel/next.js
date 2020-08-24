import { DeliveryClient } from '@kentico/kontent-delivery'
import { name, version } from '../package.json'

const sourceTrackingHeaderName = 'X-KC-SOURCE'

const client = new DeliveryClient({
  projectId: process.env.KONTENT_PROJECT_ID,
  previewApiKey: process.env.KONTENT_PREVIEW_API_KEY,
  globalHeaders: (_queryConfig) => [
    {
      header: sourceTrackingHeaderName,
      value: `@vercel/next.js/example/${name};${version}`,
    },
  ],
})

function parseAuthor(author) {
  return {
    name: author.name.value,
    picture: author.picture.value[0].url,
  }
}

function parsePost(post) {
  return {
    title: post.title.value,
    slug: post.slug.value,
    date: post.date.value.toISOString(),
    content: post.content.value,
    excerpt: post.excerpt.value,
    coverImage: post.cover_image.value[0].url,
    author: parseAuthor(post.author.value[0]),
  }
}

export async function getAllPostSlugs() {
  const postsResponse = await client
    .items()
    .type('post')
    .elementsParameter(['slug'])
    .toPromise()

  return postsResponse.items.map((post) => post.slug.value)
}

export async function getMorePostsForSlug(slug, preview) {
  return client
    .items()
    .queryConfig({
      usePreviewMode: !!preview,
    })
    .type('post')
    .orderByDescending('elements.date')
    .withParameter('elements.slug[neq]', slug)
    .limitParameter(2)
    .toPromise()
    .then((res) => {
      return res.items.map((post) => parsePost(post))
    })
}

export async function getPostBySlug(slug, preview) {
  const post = await client
    .items()
    .queryConfig({
      usePreviewMode: !!preview,
    })
    .type('post')
    .equalsFilter('elements.slug', slug)
    .toPromise()
    .then((result) => result.getFirstItem())
    .then((post) => parsePost(post))
  return post
}

export async function getAllPosts(preview) {
  return await client
    .items()
    .queryConfig({
      usePreviewMode: !!preview,
    })
    .type('post')
    .orderByDescending('elements.date')
    .toPromise()
    .then((postsResponse) => postsResponse.items.map((post) => parsePost(post)))
}
