module.exports = {
  output: 'export',
  exportTrailingSlash: true,
  exportPathMap: function (defaultPathMap) {
    if (defaultPathMap['/blog/[post]']) {
      throw new Error('Found Incremental page in the default export path map')
    }
    return defaultPathMap
  },
}
