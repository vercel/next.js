module.exports = function upperLoader(source) {
  const upper = source.toUpperCase()
  return `export default ${JSON.stringify(upper)}`
}
