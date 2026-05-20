const nextConfig = {
  experimental: {
    reactDebugChannel: process.env.REACT_DEBUG_CHANNEL !== '0',
  },
  cacheComponents: process.env.CACHE_COMPONENTS === '1',
}

export default nextConfig
