/** @type {import('next').NextConfig} */
module.exports = {
  basePath: '/remote',
  experimental: {
    turbopackModuleFederation: {
      name: 'remoteApp',
      filename: 'static/custom/remoteEntry.js',
      exposes: {
        '.': './components/root-marker',
        './Button': './components/Button',
      },
      shared: {
        'remote-shared-marker': {
          import: './components/shared-marker',
          version: '1.0.0',
          eager: true,
        },
        react: { import: false, singleton: true, eager: true },
        'react/jsx-runtime': { import: false, singleton: true, eager: true },
        'react/jsx-dev-runtime': {
          import: false,
          singleton: true,
          eager: true,
        },
        'react-dom': { import: false, singleton: true, eager: true },
      },
    },
  },
}
