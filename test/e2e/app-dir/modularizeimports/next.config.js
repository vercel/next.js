const withMDX = require('@next/mdx')()

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'md', 'mdx'],
  modularizeImports: {
    'design-system/icons': {
      transform: 'design-system/icons/{{ kebabCase member }}',
      skipDefaultConversion: true,
    },
  },
  experimental: {
    mdxRs: true,
  },
}

module.exports = withMDX(nextConfig)
