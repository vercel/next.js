module.exports = {
  cacheComponents: true,
  experimental: {
    cacheLife: {
      expireNow: {
        stale: 0,
        expire: 0,
        revalidate: 0,
      },
    },
  },
}
