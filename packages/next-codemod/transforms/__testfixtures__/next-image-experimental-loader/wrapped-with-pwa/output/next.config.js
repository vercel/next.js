const withPwa = (opts) => {
  // no-op but image this adds props
  return opts
}
module.exports = withPwa({
  images: {
    loader: "custom",
    loaderFile: "./cloudinary-loader.js",
  },
})