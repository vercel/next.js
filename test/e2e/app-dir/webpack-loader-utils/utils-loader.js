module.exports = function () {
  const { absolutify, contextify, createHash } = this.utils
  return `export default ${JSON.stringify({
    relative: contextify(this.rootContext, this.resourcePath + '?q'),
    absolute:
      absolutify(this.rootContext, './app/input.utils-test.js') ===
      this.resourcePath,
    hash: createHash().update('abc').digest('hex'),
    xxhash: createHash('xxhash64').update('abc').digest('hex'),
    webpack: this.webpack === true,
    compiler: this._compiler !== undefined,
    mode: this.mode,
  })}`
}
