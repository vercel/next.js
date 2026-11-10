const fs = require('node:fs')

module.exports = function errorLoader(source) {
  const value = source.trim()
  if (value === 'throw') {
    const { marker } = this.getOptions()
    setTimeout(() => fs.writeFileSync(marker, 'worker survived'), 1000)
    throw new Error('EXPECTED_WORKER_THREAD_LOADER_ERROR')
  }

  return `export default ${JSON.stringify(value)}`
}
