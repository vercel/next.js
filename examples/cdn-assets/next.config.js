module.exports = {
  assetPrefix ({ buildId }) {
    // In a real app, you need to put the CDN's URL here. Something like `https://cdn.mysite.com/`.
    // `buildId` can be used for specifiying specific versions of assets.
    return `http://localhost:9999/assets/${buildId}/`
  }
}
