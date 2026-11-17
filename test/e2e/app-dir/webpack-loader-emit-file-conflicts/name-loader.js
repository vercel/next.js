module.exports = function (source) {
  const { outputPath } = this.getOptions()
  const name = source.trim()
  // Not valid JavaScript, so minifying a `.js` name fails.
  this.emitFile(`${outputPath}/${name}`, name.endsWith('.js') ? '(' : 'named')
  return 'export default "name"'
}
