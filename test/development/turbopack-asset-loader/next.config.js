/** @type {import('next').NextConfig} */
module.exports = {
  turbopack: {
    rules: {
      '*.svg': {
        loaders: [],
        type: 'static',
        condition: {
          query: /url/,
        },
      },
    },
  },
}
