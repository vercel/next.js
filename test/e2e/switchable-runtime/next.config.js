/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  async rewrites() {
    return {
      afterFiles: [
        {
          source: '/rewrite/edge',
          destination: '/edge',
        },
        {
          source: '/rewrite/api/edge',
          destination: '/api/edge',
        },
      ],
    }
  },
}
