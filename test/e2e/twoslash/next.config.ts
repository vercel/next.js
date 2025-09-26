import type { NextConfig } from 'next'
const path = require('path')

const nextConfig: NextConfig = {
  // output: 'standalone',
  outputFileTracingIncludes: {
    '/': [
      path.relative(
        process.cwd(),
        path.resolve(
          require.resolve('typescript/package.json'),
          '..',
          'lib',
          'lib.*.d.ts'
        )
      ),
    ],
  },
  serverExternalPackages: ['twoslash'],
}

module.exports = nextConfig
