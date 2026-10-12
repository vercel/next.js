module.exports = function identityCssLoader(source) {
  console.log('custom-css-loader-ran')
  return `${source}\n/* custom-turbopack-loader-ran */`
}
