module.exports = {
  experimental: {
    turbo: {
      loaders: {
        '.replace': [
          { loader: 'replace-loader', options: { defaultExport: 3 } },
        ],
      },
    },
  },
}
