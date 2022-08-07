const withMakeswift = require('@makeswift/runtime/next/plugin')()

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
}

module.exports = withMakeswift(nextConfig)
