/** @type {import("next").NextConfig} */
module.exports = {
  reactStrictMode: true,
  compiler: {
    compiler: {
      emotion: {
        importMap: {
          'import-map-test': {
            styledJsx: {
              canonicalImport: ['@emotion/react', 'jsx'],
            },
          },
        },
      },
    },
  },
}
