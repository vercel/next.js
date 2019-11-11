module.exports = {
  exportPathMap: function() {
    return {
      '/': { page: '/', query: { showMore: false } },
      '/about': { page: '/about' },
    }
  },
}
