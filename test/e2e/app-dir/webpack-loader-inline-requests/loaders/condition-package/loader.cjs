module.exports = function () {
  return `module.exports = ${JSON.stringify({
    entry: 'loader-condition',
    options: this.getOptions(),
  })}`
}
