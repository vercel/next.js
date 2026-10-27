module.exports = function (source) {
  return `fallback:${source.trim()}`
}
