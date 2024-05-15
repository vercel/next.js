module.exports = {
  experimental: {
    turbo: {
      resolveAlias: {
        'preact/compat': 'react',
      },
    },
  },
  serverExternalPackages: [
    'app-esm-package1',
    'app-esm-package2',
    'app-cjs-esm-package',
  ],
  webpack(config, { isServer }) {
    config.resolve.alias = {
      ...config.resolve.alias,
      'preact/compat': 'react',
    }
    return config
  },
}
