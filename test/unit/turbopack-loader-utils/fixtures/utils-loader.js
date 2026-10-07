module.exports = function () {
  const { absolutify, contextify, createHash } = this.utils
  return JSON.stringify({
    relative: contextify(this.rootContext, this.resourcePath + '?q'),
    absolute: absolutify(this.rootContext, './src/input.js'),
    hash: createHash().update('abc').digest('hex'),
    xxhash: createHash('xxhash64').update('abc').digest('hex'),
    webpack: this.webpack === true,
    compiler: this._compiler !== undefined,
  })
}
