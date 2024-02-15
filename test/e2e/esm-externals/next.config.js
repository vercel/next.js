module.exports = {
  experimental: {
    esmExternals: true,
    serverComponentsExternalPackages: [
      'app-esm-package1',
      'app-esm-package2',
      'app-invalid-esm-package',
    ],
  },
}
