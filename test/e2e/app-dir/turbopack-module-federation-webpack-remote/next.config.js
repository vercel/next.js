/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    turbopackModuleFederation: {
      name: 'nextHost',
      remotes: {
        catalog: `catalog@${process.env.MF_REMOTE_URL}`,
      },
      shared: {
        'shared-value': {
          import: './shared-value.js',
          shareKey: 'shared-value',
          version: '1.2.0',
          singleton: true,
        },
      },
    },
  },
}

module.exports = nextConfig
