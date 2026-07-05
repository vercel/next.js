import type { NextConfig } from 'next'

const config: NextConfig = {
  experimental: {
    turbopackImportTypeBytes: true,
    turbopackImportTypeText: true,
  },
  turbopack: {
    rules: {
      // This rule configures a .txt file as ecmascript to test that
      // import attributes (with { type: 'bytes' }) take priority
      '**/configured-as-ecmascript.txt': {
        type: 'ecmascript',
      },
    },
  },
}

export default config
