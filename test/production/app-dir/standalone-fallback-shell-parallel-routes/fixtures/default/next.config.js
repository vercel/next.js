/** @type {import('next').NextConfig} */
module.exports = {
  cacheComponents: true,
  output: 'standalone',
  outputFileTracingRoot: process.cwd(),
  outputFileTracingIncludes: {
    '/*': ['node_modules/@swc/helpers/**/*'],
  },
}
