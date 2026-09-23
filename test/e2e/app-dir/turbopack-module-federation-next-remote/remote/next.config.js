/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    turbopackModuleFederation: {
      name: 'nextRemote',
      filename: 'nextRemote.js',
      implementation:
        process.env.MF_IMPLEMENTATION === 'resolved'
          ? require.resolve('@module-federation/runtime-tools')
          : process.env.MF_IMPLEMENTATION || undefined,
      shareScope: 'catalog',
      exposes: {
        './message': './lib/message.js',
        './lazy': './lib/lazy.js',
      },
      shared: {
        'shared-value': {
          import: './lib/shared-value.js',
          shareKey: 'producer-value',
          version: '1.0.0',
        },
        'shared-value-new': {
          import: './lib/shared-value-new.js',
          shareKey: 'producer-value',
          version: '1.2.0',
          eager: true,
        },
        'other-value': {
          import: './lib/shared-value.js',
          shareScope: 'other',
          version: '2.0.0',
        },
        'host-only': { import: false },
      },
    },
  },
}

module.exports = nextConfig
