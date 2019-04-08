const redirects = require(`./redirects`)

module.exports = {
  exportPathMap: function () {
    const staticPages = redirects.map(redirect => redirect.staticPage)
    const staticExports = staticPages.reduce(
      (memo, page) => ({
        ...memo,
        [page]: { page }
      }),
      {}
    )

    return {
      '/': { page: `/` },
      ...staticExports
    }
  }
}
