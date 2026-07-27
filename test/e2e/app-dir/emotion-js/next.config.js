/** @type {import("next").NextConfig} */
module.exports = {
  reactStrictMode: true,
  compiler: {
    emotion: {
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
