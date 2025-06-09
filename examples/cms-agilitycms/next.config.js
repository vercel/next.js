/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
      remotePatterns: [
        {
          protocol: 'https',
          hostname: 'cdn.aglty.io',
          pathname: '/**',
        },
      ],
    },
    reactStrictMode: true,
  }
  
  module.exports = nextConfig