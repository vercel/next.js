// Use the hidden-source-map option when you don't want the source maps to be
// publicly available on the servers, only to the error reporting
const withSourceMaps = require('@zeit/next-source-maps')()

// Use the SentryWebpack plugin to upload the source maps during build step
const SentryWebpackPlugin = require('@sentry/webpack-plugin')
const {
  NEXT_PUBLIC_SENTRY_DSN,
  SENTRY_ORG,
  SENTRY_PROJECT,
  SENTRY_AUTH_TOKEN,
  NODE_ENV,
  VERCEL_URL,
} = process.env

process.env.SENTRY_DSN = NEXT_PUBLIC_SENTRY_DSN

module.exports = withSourceMaps({
  experimental: {
    plugins: true,
  },
  env: {
    // Required for now because the experimental plugins API is not checking
    // for variables with the NEXT_PUBLIC prefix that are automatically pulled
    // in
    NEXT_PUBLIC_SENTRY_DSN: NEXT_PUBLIC_SENTRY_DSN,
  },
  webpack: (config, options) => {
    // The build ID is only available here, so this is where we'll define its
    // environment variable
    config.plugins.push(
      new options.webpack.DefinePlugin({
        'process.env.NEXT_PUBLIC_SENTRY_RELEASE': JSON.stringify(
          options.buildId
        ),
      })
    )

    // When all the Sentry configuration env variables are available/configured
    // The Sentry webpack plugin gets pushed to the webpack plugins to build
    // and upload the source maps to sentry.
    // This is an alternative to manually uploading the source maps
    // Note: This is disabled unless the VERCEL_URL environment variable is
    // present, which is usually only during a Vercel build
    if (
      process.env.SENTRY_DSN &&
      SENTRY_ORG &&
      SENTRY_PROJECT &&
      SENTRY_AUTH_TOKEN &&
      VERCEL_URL &&
      NODE_ENV === 'production'
    ) {
      config.plugins.push(
        new SentryWebpackPlugin({
          include: '.next',
          stripPrefix: ['webpack://_N_E/'],
          urlPrefix: '~/_next',
          release: options.buildId,
        })
      )
    }

    return config
  },
})
