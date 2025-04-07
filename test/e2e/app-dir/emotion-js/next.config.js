/** @type {import("next").NextConfig} */
module.exports = {
  reactStrictMode: true,
  compiler: {
    emotion: {
      enabled: true,
      importMap: {
        'import-map-test': {
          styledCss: {
            canonicalImport: ['@emotion/react', 'css'],
          },
        },
      },
    },
  },
}
