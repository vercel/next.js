// @ts-check

/**
 * @type {import('next').NextConfig}
 **/
const nextConfig = {
  output: 'export',
  basePath: '/gh-pages-test',
  experimental: {
    appDir: true,
  },
}

module.exports = nextConfig
