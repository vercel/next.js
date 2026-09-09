import { cacheLife, cacheTag } from 'next/cache'

export async function getArticles() {
  'use cache'
  cacheLife('hours')
  cacheTag('articles')
  await new Promise((r) => setTimeout(r, 100))
  return [
    { slug: 'hello', title: 'Hello', draft: false },
    { slug: 'wip', title: 'WIP piece', draft: true },
  ]
}
