module.exports = function (source) {
  return source
    .replaceAll("'__TARGET__'", JSON.stringify(this.target))
    .replaceAll("'__MODE__'", JSON.stringify(this.mode))
}
