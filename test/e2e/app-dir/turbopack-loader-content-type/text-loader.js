module.exports = function textLoader(source) {
  return `export default ${JSON.stringify('TEXT:' + source)}`
}
