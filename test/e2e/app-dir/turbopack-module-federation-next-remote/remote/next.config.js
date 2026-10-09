/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    turbopackModuleFederation: {
      name: 'nextRemote',
      filename: 'nested/nextRemote.js',
      exposes: {
        './message': './lib/message.js',
        './component': './lib/component.js',
      },
      shared: {
        react: { singleton: true, eager: true, requiredVersion: false },
        'shared-value': {
          import: './lib/shared-value.js',
          eager: true,
          singleton: true,
          version: '1.0.0',
          requiredVersion: false,
        },
      },
    },
  },
}

module.exports = nextConfig
