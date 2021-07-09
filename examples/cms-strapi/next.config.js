const { hostname } = new URL(process.env.NEXT_PUBLIC_STRAPI_API_URL)

module.exports = {
  images: {
    domains: [hostname],
  },
}
