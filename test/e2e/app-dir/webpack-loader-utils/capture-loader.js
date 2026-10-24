module.exports = function (source) {
  // Export the pitched source so its requests can be checked without executing them.
  return `export default ${JSON.stringify(source)}`
}
