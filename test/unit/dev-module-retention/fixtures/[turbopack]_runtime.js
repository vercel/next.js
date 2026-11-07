const path = require('path')
const ballast = new Array(128 * 1024).fill(42)
const sharedPath = path.join(__dirname, 'shared.cjs')
const changedPath = path.join(__dirname, 'changed.cjs')
const asyncPath = path.join(__dirname, 'async.cjs')

module.exports = {
  ballast,
  relative: require('./relative.cjs'),
  shared: require(sharedPath),
  changed: require(changedPath),
  loadAsync: () => Promise.resolve().then(() => require(asyncPath)),
  loadMissing: () => require(path.join(__dirname, 'missing.cjs')),
}
