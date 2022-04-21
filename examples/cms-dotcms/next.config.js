module.exports = {
  images: {
    deviceSizes: [640, 750, 828, 1080, 1200],
   },
  async rewrites() {
    const baseUrl = process.env.NEXT_PUBLIC_DOTCMS_HOST
    return [
      {
        source: '/images/:slug*',
        destination: `${baseUrl}/images/:slug*`,
      },
    ]
  },
}
