module.exports = function imageLoader(source) {
  return `export default ${JSON.stringify('IMAGE:' + source.length + ' bytes')}`
}
