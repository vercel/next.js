/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // Cache Components is not supported in the edge runtime. Pin it (and
  // cachedNavigations, which requires it) off so the fixture stays a valid
  // edge app in every CI shard, including the Cache Components ones.
  cacheComponents: false,
  experimental: {
    cachedNavigations: false,
  },
  cacheHandlers: {
    default: require.resolve('./default-handler'),
    custom: require.resolve('./custom-handler'),
  },
}

module.exports = nextConfig
