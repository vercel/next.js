const withPwa = require('next-pwa')()

module.exports = withPwa({
  images: {
    loader: "custom",
    loaderFile: "./cloudinary-loader.js"
  },
})