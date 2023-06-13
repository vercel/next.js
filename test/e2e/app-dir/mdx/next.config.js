const shouldUseMdxRs = process.env.WITH_MDX_RS === 'true'

const withMDX = require('@next/mdx')({
  extension: /\.mdx?$/,
})

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'mdx'],
  experimental: {
    mdxRs: shouldUseMdxRs,
  },
}

if (shouldUseMdxRs) {
  nextConfig.experimental.turbo = {
    rules: {
      '*.mdx': [
        {
          loader: '@mdx-js/loader',
          options: {
            providerImportSource: '@vercel/turbopack-next/mdx-import-source',
          },
        },
      ],
    },
  }
}

module.exports = withMDX(nextConfig)
