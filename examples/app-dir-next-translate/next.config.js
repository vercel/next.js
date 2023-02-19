// @ts-check
const nextTranslate = require('next-translate-plugin')

/**
 * @type {import('next').NextConfig}
 **/
const nextConfig = nextTranslate({
  experimental: {
    appDir: true,
  },
})

module.exports = nextConfig
