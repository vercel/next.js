const developmentRewrites = () => {
  return [
    {
      source: '/data/:path*',
      destination: 'http://localhost:4000/data/:path*',
    },
  ]
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  distDir: 'dist',
  rewrites:
    process.env.NODE_ENV === 'development' ? developmentRewrites : undefined,
}

export default nextConfig
