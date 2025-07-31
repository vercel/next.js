/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  rewrites: async () => {
    return {
      beforeFiles: [
        {
          source: '/',
          destination: '/foo',
        },
      ],
    }
  },
}

module.exports = nextConfig
