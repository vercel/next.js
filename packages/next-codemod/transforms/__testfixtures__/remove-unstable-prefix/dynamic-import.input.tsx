// @ts-nocheck
/* eslint-disable */
async function loadCache() {
  // Dynamic import with destructuring
  const { unstable_cacheTag, unstable_cacheLife } = await import('next/cache')

  // Dynamic import with property access
  const cache = await import('next/cache')
  const directTag = cache.unstable_cacheTag
  const directLife = cache.unstable_cacheLife

  return { directTag, directLife }
}

// Dynamic import without await
const cachePromise = import('next/cache').then(({ unstable_cacheTag, unstable_cacheLife }) => {
  const tag = unstable_cacheTag('async-tag')
  const life = unstable_cacheLife('3 hours')
  return { tag, life }
})