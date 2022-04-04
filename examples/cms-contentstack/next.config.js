const withPWA = require('next-pwa')
const assetHost = process.env.CONTENTSTACK_API_HOST?.replace(/api/g, 'images')
const config = {
  publicRuntimeConfig: {
    // Will be available on both server and client
    CONTENTSTACK_API_KEY: process.env.CONTENTSTACK_API_KEY,
    CONTENTSTACK_DELIVERY_TOKEN: process.env.CONTENTSTACK_DELIVERY_TOKEN,
    CONTENTSTACK_ENVIRONMENT: process.env.CONTENTSTACK_ENVIRONMENT,
    CONTENTSTACK_MANAGEMENT_TOKEN: process.env.CONTENTSTACK_MANAGEMENT_TOKEN,
    CONTENTSTACK_API_HOST:
      process.env.CONTENTSTACK_API_HOST || 'api.contentstack.io',
    CONTENTSTACK_APP_HOST:
      process.env.CONTENTSTACK_APP_HOST || 'app.contentstack.com',
    CONTENTSTACK_LIVE_PREVIEW: process.env.CONTENTSTACK_LIVE_PREVIEW || 'true',
    CONTENTSTACK_LIVE_EDIT_TAGS:
      process.env.CONTENTSTACK_LIVE_EDIT_TAGS || 'false',
  },
  devIndicators: {
    autoPrerender: false,
  },
  pwa: {
    dest: 'public',
  },
  images: {
    domains: [assetHost],
  },
}
module.exports =
  process.env.NODE_ENV === 'development' ? config : withPWA(config)
