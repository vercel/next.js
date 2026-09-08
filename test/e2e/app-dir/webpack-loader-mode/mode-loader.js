module.exports = function () {
  return `export default ${JSON.stringify(this.mode)}`
}
