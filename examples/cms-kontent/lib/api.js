import { DeliveryClient } from '@kentico/kontent-delivery'
import pkg from '../package.json'

const sourceTrackingHeaderName = 'X-KC-SOURCE'

const client = new DeliveryClient({
  projectId: process.env.KONTENT_PROJECT_ID,
  previewApiKey: process.env.KONTENT_PREVIEW_API_KEY,
  globalHeaders: (_queryConfig) => [
    {
      header: sourceTrackingHeaderName,
      value: `@vercel/next.js/example/${pkg.name};${pkg.version}`,
    },
  ],
})

function parseAuthor(author) {
  return {
    name: author.elements.name.value,
    picture: author.elements.picture.value[0].url,
  }
}

function parsePost(post) {
  return {
    title: post.elements.title.value,
    slug: post.elements.slug.value,
    date: post.elements.date.value,
    content: post.elements.content.value,
    excerpt: post.elements.excerpt.value,
    coverImage: post.elements.cover_image.value[0].url,
    author: parseAuthor(post.elements.author.linkedItems[0]),
  }
}

export async function getAllPostSlugs() {
  return await client
    .items()
    .type('post')
    .elementsParameter(['slug'])
    .toPromise()
    .then((response) =>
      response.data.items.map((post) => post.elements.slug.value)
    )
}

export async function getMorePostsForSlug(slug, preview) {
  return client
    .items()
    .queryConfig({
      usePreviewMode: !!preview,
    })
    .type('post')
    .orderByDescending('elements.date')
    .notEqualsFilter('elements.slug', slug)
    .limitParameter(2)
    .toPromise()
    .then((response) => response.data.items.map((post) => parsePost(post)))
}

export async function getPostBySlug(slug, preview) {
  return await client
    .items()
    .queryConfig({
      usePreviewMode: !!preview,
    })
    .type('post')
    .equalsFilter('elements.slug', slug)
    .toPromise()
    .then((response) => parsePost(response.data.items[0]))
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
    .then((response) => response.data.items.map((post) => parsePost(post)))
}
