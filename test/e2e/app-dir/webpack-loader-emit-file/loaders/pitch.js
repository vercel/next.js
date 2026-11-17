module.exports = function () {
  throw new Error('Normal phase must not run after pitch returns a value')
}

module.exports.pitch = function () {
  const { outputPath } = this.getOptions()
  this.emitFile(`${outputPath}/pitch.txt`, 'pitch-content')
  return 'export default "/_next/static/media/pitch.txt"'
}
