module.exports = function (source) {
  return `export default ${JSON.stringify(`sync:${source.trim()}`)}`
}
