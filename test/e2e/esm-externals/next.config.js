module.exports = {
  // Testing that externals still work after aliasing
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      'preact/compat': 'react',
    }
    return config
  },
  experimental: {
    turbo: {
      resolveAlias: {
        'preact/compat': 'react',
      },
    },
    serverComponentsExternalPackages: [
      'app-esm-package1',
      'app-esm-package2',
      'app-invalid-esm-package',
    ],
  },
}
