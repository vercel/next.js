const fs = require('fs')
const path = require('path')

const logFile = path.join(__dirname, '.entry-log')
const callbackLogFile = path.join(__dirname, '.callback-log')

/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    deferredEntries: ['/deferred'],
    onBeforeDeferredEntries: async () => {
      const timestamp = Date.now()
      // Write the callback log file - this file existing proves callback was called
      fs.writeFileSync(callbackLogFile, `callback:${timestamp}\n`)
      console.log(
        `[TEST] onBeforeDeferredEntries callback executed at ${timestamp}`
      )

      // Small delay to ensure we can verify timing
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Append to entry log to mark callback position in the build sequence
      fs.appendFileSync(logFile, `${timestamp}:CALLBACK_EXECUTED\n`)
    },
  },
  // Turbopack loader configuration
  turbopack: {
    rules: {
      '*.tsx': {
        loaders: [
          {
            loader: path.join(__dirname, 'entry-logger-loader.js'),
          },
        ],
      },
    },
  },
  // Webpack loader configuration
  webpack: (config, { isServer }) => {
    // Add the entry logger loader to track when entries are processed
    config.module.rules.push({
      test: /\.(tsx|ts|js|jsx)$/,
      include: [path.join(__dirname, 'app'), path.join(__dirname, 'pages')],
      use: [
        {
          loader: path.join(__dirname, 'entry-logger-loader.js'),
        },
      ],
    })

    return config
  },
}
