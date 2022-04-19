import { Builder, builder } from '@builder.io/react'
import { BUILDER_CONFIG } from './constants'

builder.init(BUILDER_CONFIG.apiKey)
Builder.isStatic = true

export function getAllPostsWithSlug() {
  return builder.getAll(BUILDER_CONFIG.postsModel, {
    options: { noTargeting: true },
    apiKey: BUILDER_CONFIG.apiKey,
  })
}

export async function getPost(mongoQuery) {
  let post = await builder
  .get(BUILDER_CONFIG.postsModel, {
    includeRefs: true,
    staleCacheSeconds: 20,
    apiKey: BUILDER_CONFIG.apiKey,
    preview: BUILDER_CONFIG.postsModel,
    options: {
      noTargeting: true,
    },
    query: mongoQuery,
  })
  .toPromise()

  return post || null
}

export async function getPostBySlug(slug) {
  const post = await getPost(
    {
      'data.slug': { $eq: slug },
    }
  )

  return {
    post,
  }
}
