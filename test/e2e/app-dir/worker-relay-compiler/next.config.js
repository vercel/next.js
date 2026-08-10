/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  compiler: {
    relay: {
      src: './',
      language: 'typescript',
    },
  },
}

module.exports = nextConfig
