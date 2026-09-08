/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    turbopackModuleFederation: {
      name: 'nextRemote',
      filename: 'nested/nextRemote.js',
      exposes: {
        './message': './lib/message.js',
      },
    },
  },
}

module.exports = nextConfig
