/** @type {import('next').NextConfig} */
module.exports = {
  turbopack: {
    resolveExtensionAlias: {
      '.js': ['.ts', '.tsx', '.js'],
    },
  },
}
