const fs = require('node:fs')
const path = require('node:path')

const linkedPackage = fs.realpathSync(path.join(__dirname, 'linked'))

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputHashSalt: 'adapter-symlink-test',
  serverExternalPackages: ['sibling'],
  experimental: {
    turbopackAdditionalRoots: {
      linkedPackages: {
        path: path.resolve(linkedPackage, '../..'),
      },
      missingOptional: {
        path: './missing-optional-root',
        ignoreIfMissing: false,
      },
    },
  },
}

if (
  !process.env.NEXT_ADAPTER_PATH &&
  process.env.NEXT_TEST_CAPTURE_ADAPTER === '1'
) {
  nextConfig.adapterPath = require.resolve('./capture-adapter.mjs')
}

module.exports = nextConfig
