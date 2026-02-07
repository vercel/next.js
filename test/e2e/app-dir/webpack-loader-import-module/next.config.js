/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  turbopack: {
    rules: {
      '*.test-file.ts': {
        loaders: [require.resolve('./test-file-loader.js')],
        as: '*.js',
      },
    },
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.test-file\.ts/,
      use: require.resolve('./test-file-loader.js'),
    })
    // Required so webpack can compile .wasm files referenced by
    // url-wasm-data.ts (used via importModule in the loader).
    // The actual wasm execution in importModule doesn't work in
    // webpack, but compilation needs to succeed.
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    }
    return config
  },
}

module.exports = nextConfig
