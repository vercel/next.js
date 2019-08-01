const webpack = require('webpack')

module.exports = {
  experimental: {
    publicDirectory: true
  },
  webpack (config, { isServer, dev, buildId }) {
    // This is just was display purposes, not needed for Service Worker Setup
    config.plugins.push(
      new webpack.DefinePlugin({
        'process.env.NEXT_BUILD_ID': JSON.stringify(buildId)
      })
    )

    if (!isServer && !dev) {
      const { InjectManifest } = require('workbox-webpack-plugin')
      config.plugins.push(
        new InjectManifest({
          swSrc: './utils/service-worker/sw.ts',
          swDest: '../public/sw.js',
          manifestTransforms: [
            _manifest => {
              const manifest = _manifest
                .filter(
                  ({ url }) =>
                    ![
                      'build-manifest.json',
                      'react-loadable-manifest.json'
                    ].includes(url)
                )
                .map(entry => ({
                  ...entry,
                  url: `_next/${entry.url}`
                }))

              return {
                manifest
              }
            }
          ]
        })
      )
    }
    return config
  }
}
