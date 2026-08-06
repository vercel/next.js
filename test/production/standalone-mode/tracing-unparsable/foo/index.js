function doRequire(mod) {
  return require('./' + mod)
}

module.exports = doRequire('value.js')
