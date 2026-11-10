/** @type {import('next').NextConfig} */
const nextConfig = {
  // When a route has `export const revalidate = N` but no explicit `expire`
  // (e.g. no `cacheLife`), the build falls back to `expireTime` for the route's
  // `initialExpireSeconds` in the prerender manifest. Keep this low so the test
  // can wait past it without slowing CI down.
  expireTime: 10,
}

module.exports = nextConfig
