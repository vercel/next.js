const { writeFileSync } = require('fs')
const path = require('path')
const { StatsWriterPlugin } = require('webpack-stats-plugin')

/**
 * @type {import('next').NextConfig}
 */
const config = {
  experimental: {
    reactMarkup: true,
  },
  webpack: (config, { isServer, nextRuntime, dev }) => {
    config.plugins.push(
      new StatsWriterPlugin({
        stats: 'verbose',
        transform(data) {
          const json = JSON.stringify(data, null, 2)

          writeFileSync(
            path.join(
              process.env.HOME,
              'stats/react-markup',
              `stats.${isServer ? 'server' : 'client'}${
                nextRuntime ? `.${nextRuntime}` : ''
              }.${dev ? 'dev' : 'prod'}.bad.json`
            ),
            json
          )

          return json
        },
      })
    )

    return config
  },
}

module.exports = config
