const withPwa = require('next-pwa')()

module.exports = withPwa({
  images: {
    loader: "cloudinary",
    path: "https://example.com/"
  },
})