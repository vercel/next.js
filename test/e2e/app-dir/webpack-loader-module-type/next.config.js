/** @type {import('next').NextConfig} */
module.exports = {
  turbopack: {
    rules: {
      '*.svg': {
        type: 'asset',
      },
      '*.data': {
        type: 'bytes',
      },
    },
  },
  webpack(config) {
    // Override the default svg handling to use asset/resource
    config.module.rules.push({
      test: /\.svg$/,
      type: 'asset/resource',
    })
    // Use asset/source for .data files (returns string, not Uint8Array like Turbopack's bytes)
    config.module.rules.push({
      test: /\.data$/,
      type: 'asset/source',
    })
    return config
  },
}
