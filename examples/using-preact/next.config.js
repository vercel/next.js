const withPreact = require('next-plugin-preact')

/** @type {import('next').NextConfig} */
const nextConfig = {
  /* regular next.js config options here */
}

module.exports = withPreact(nextConfig)
