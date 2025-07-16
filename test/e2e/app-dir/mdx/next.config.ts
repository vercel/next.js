import nextMDX from '@next/mdx'
const withMDX = nextMDX({
  extension: /\.mdx?$/,
  options: {
    remarkPlugins: ['remark-gfm', ['remark-toc', { heading: 'The Table' }]],
    rehypePlugins: [
      'rehype-slug',
      ['rehype-katex', { strict: true, throwOnError: true }],
    ],
  },
})

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'mdx'],
  experimental: {
    mdxRs: process.env.WITH_MDX_RS === 'true',
  },
}

export default withMDX(nextConfig)
