module.exports = function (source) {
  this.emitFile('loader-output/unused.txt', source)
  return 'export default function unused() { return "unused" }'
}
