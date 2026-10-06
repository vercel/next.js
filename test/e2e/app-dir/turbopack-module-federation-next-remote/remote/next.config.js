/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    // Manifest URLs are fetched across origins by the enhanced runtime (unlike script tags).
    return [
      {
        source: '/_next/static/mf-manifest.json',
        headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }],
      },
    ]
  },
  experimental: {
    turbopackModuleFederation: {
      name: 'nextRemote',
      filename: 'nested/nextRemote.js',
      exposes: {
        './message': './lib/message.js',
        './component': './lib/component.js',
        './composite': ['./lib/component.css', './lib/message.js'],
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
