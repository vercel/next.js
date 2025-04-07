/** @type {import("next").NextConfig} */
module.exports = {
  reactStrictMode: true,
  compiler: {
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
  },
}
