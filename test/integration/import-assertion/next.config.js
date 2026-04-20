/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Using import assertions which are not supported since TypeScript 6.0
    ignoreBuildErrors: true,
  },
}

module.exports = nextConfig
