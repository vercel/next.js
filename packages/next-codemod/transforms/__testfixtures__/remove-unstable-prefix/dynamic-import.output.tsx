// @ts-nocheck
/* eslint-disable */
async function loadCache() {
  // Dynamic import with destructuring
  const { cacheTag, cacheLife } = await import('next/cache')

  // Dynamic import with property access
  const cache = await import('next/cache')
  const directTag = cache.cacheTag
  const directLife = cache.cacheLife

  return { directTag, directLife }
}

// Dynamic import without await
const cachePromise = import('next/cache').then(({ cacheTag, cacheLife }) => {
  const tag = cacheTag('async-tag')
  const life = cacheLife('3 hours')
  return { tag, life }
})