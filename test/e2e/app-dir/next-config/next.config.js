// This should work
require('webpack')

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack(config) {
    return config
  },
}

module.exports = nextConfig
