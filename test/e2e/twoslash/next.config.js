const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // output: 'standalone',

  // TODO ideally, all of these manual includes wouldn't be necessary. Maybe we can improve that for
  // Turbopack
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
      './node_modules/@types/node/**',
    ],
  },
  serverExternalPackages: ['twoslash'],
}

module.exports = nextConfig
