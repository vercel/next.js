const port = process.env.MF_PROXY_PORT || process.env.PORT || '3000'
const origin = `http://localhost:${port}`

/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    turbopackModuleFederation: {
      name: 'hostApp',
      remotes: {
        remoteApp: {
          entry: [
            `${origin}/missing-remote-entry.js`,
            `${origin}/remote/_next/static/custom/remoteEntry.js`,
          ],
        },
        webpackRemote: {
          entry: `${origin}/remote/webpack-remote/remoteEntry.js`,
        },
      },
      shared: {
        react: { singleton: true, eager: true },
        'react/jsx-runtime': { singleton: true, eager: true },
        'react/jsx-dev-runtime': { singleton: true, eager: true },
        'react-dom': { singleton: true, eager: true },
      },
    },
  },
}
