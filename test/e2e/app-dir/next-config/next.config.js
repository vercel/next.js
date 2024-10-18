const { defineConfig } = require('next/config')

// This should work
console.log(require('webpack').sources.RawSource)

const nextConfig = defineConfig({
  webpack(config) {
    return config
  },
})

module.exports = nextConfig
