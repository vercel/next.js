module.exports = {
  experimental: {
    turbo: {
      rules: {
        '*.replace': [
          { loader: 'replace-loader', options: { defaultExport: 3 } },
        ],
      },
    },
  },
}
