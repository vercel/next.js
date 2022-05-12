/** @type {import('next').NextConfig} */
const withMarkdoc = require('@markdoc/next.js')
const path = require('path')

const nextConfig = withMarkdoc({
  /**
   * @see https://markdoc.io/docs/nextjs#options
   */
  mode: 'server', // 'static' | 'server',
  //schemaPath: path.join(__dirname, 'markdoc')
})({
  pageExtensions: ['tsx', 'js', 'md'],
  reactStrictMode: true,
})

module.exports = nextConfig
