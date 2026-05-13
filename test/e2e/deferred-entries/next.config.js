const fs = require('fs')
const path = require('path')

const logFile = path.join(__dirname, '.entry-log')
const callbackLogFile = path.join(__dirname, '.callback-log')
const deferredPageFile = path.join(__dirname, 'app', 'deferred', 'page.tsx')
const routeHandlerFile = path.join(
  __dirname,
  'app',
  'route-handler',
  'route.ts'
)
const homePageFile = path.join(__dirname, 'app', 'page.tsx')

let lastHomePageContent = null

/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    deferredEntries: ['/deferred', '/route-handler'],
    onBeforeDeferredEntries: async () => {
      const timestamp = Date.now()
      const homePageContent = fs.readFileSync(homePageFile, 'utf-8')
      const shouldWriteDeferredTimestamp =
        lastHomePageContent === null || lastHomePageContent !== homePageContent

      // Mutate the deferred entry source directly so the deferred build picks
      // up callback-time content.
      if (shouldWriteDeferredTimestamp) {
        const deferredPageContent = fs.readFileSync(deferredPageFile, 'utf-8')
        const nextDeferredPageContent = deferredPageContent.replace(
          /const CALLBACK_TIMESTAMP = \d+/,
          `const CALLBACK_TIMESTAMP = ${timestamp}`
        )
        if (nextDeferredPageContent === deferredPageContent) {
          throw new Error(
            'Failed to update CALLBACK_TIMESTAMP in deferred page entry'
          )
        }
        fs.writeFileSync(deferredPageFile, nextDeferredPageContent)

        const routeHandlerContent = fs.readFileSync(routeHandlerFile, 'utf-8')
        const nextRouteHandlerContent = routeHandlerContent.replace(
          /const ROUTE_HANDLER_CALLBACK_TIMESTAMP = \d+/,
          `const ROUTE_HANDLER_CALLBACK_TIMESTAMP = ${timestamp}`
        )
        if (nextRouteHandlerContent === routeHandlerContent) {
          throw new Error(
            'Failed to update ROUTE_HANDLER_CALLBACK_TIMESTAMP in route handler entry'
          )
        }
        fs.writeFileSync(routeHandlerFile, nextRouteHandlerContent)

        // Persist only write-triggering callback timestamps.
        // This avoids deferred self-rebuild callback loops in webpack dev.
        fs.writeFileSync(callbackLogFile, `callback:${timestamp}\n`)
      }

      lastHomePageContent = homePageContent

      console.log(
        `[TEST] onBeforeDeferredEntries callback executed at ${timestamp} (write=${shouldWriteDeferredTimestamp})`
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
      '*ts': {
        loaders: [
          {
            loader: path.join(__dirname, 'entry-logger-loader.js'),
          },
        ],
      },
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
