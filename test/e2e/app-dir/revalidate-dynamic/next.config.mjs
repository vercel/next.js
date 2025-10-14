const nextConfig = {
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
export default nextConfig
