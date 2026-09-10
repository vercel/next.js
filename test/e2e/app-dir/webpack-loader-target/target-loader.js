module.exports = function (source) {
  return source.replaceAll("'__TARGET__'", JSON.stringify(this.target))
}
