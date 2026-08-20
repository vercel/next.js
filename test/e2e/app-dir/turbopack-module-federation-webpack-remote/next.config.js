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
        'remote-shared': {
          import: './remote-shared-fallback.js',
          version: '1.5.0',
          requiredVersion: '^2.0.0',
          singleton: true,
          strictVersion: true,
        },
        'strict-remote-shared': {
          import: false,
          shareKey: 'remote-shared',
          requiredVersion: '^3.0.0',
          singleton: true,
          strictVersion: true,
        },
        'local-fallback': {
          import: './local-fallback.js',
          version: '1.0.0',
          requiredVersion: '^1.0.0',
        },
      },
    },
  },
}

module.exports = nextConfig
