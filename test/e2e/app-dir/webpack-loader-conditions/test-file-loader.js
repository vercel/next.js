module.exports = function () {
  const options = this.getOptions()
  return `export default ${JSON.stringify(options)};`
}
