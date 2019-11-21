module.exports = {
  exportPathMap: function(defaultPathMap) {
    if (defaultPathMap['/blog/[post]']) {
      throw new Error('Found SPR page in the default export path map')
    }
    return defaultPathMap
  },
}
