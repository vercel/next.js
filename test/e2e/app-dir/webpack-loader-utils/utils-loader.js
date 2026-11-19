module.exports = function () {
  const { absolutify, contextify, createHash } = this.utils
  const { outputOptions } = this._compilation
  let compilationHooksRead
  try {
    compilationHooksRead = typeof this._compilation.hooks
  } catch (error) {
    compilationHooksRead = error.message
  }
  return `export default ${JSON.stringify({
    relative: contextify(this.rootContext, this.resourcePath + '?q'),
    absolute:
      absolutify(this.rootContext, './app/input.utils-test.js') ===
      this.resourcePath,
    hash: createHash().update('abc').digest('hex'),
    xxhash: createHash('xxhash64').update('abc').digest('hex'),
    webpack: this.webpack === true,
    compiler: this._compiler !== undefined,
    compilationHooks: 'hooks' in this._compilation,
    compilationHooksRead,
    compilationOptionsProbe: this._compilation.options === undefined,
    hashOptions: {
      hashFunction: outputOptions.hashFunction,
      hashDigest: outputOptions.hashDigest,
      hashDigestLength: outputOptions.hashDigestLength,
      hashSalt: outputOptions.hashSalt ?? null,
    },
    paths: [
      this._compilation.getPath('[path][base][query][fragment]', {
        filename: 'styles/panel.module.css?theme=dark#button',
      }),
      this._compilation.getPath(
        '[name]-[id]-[contenthash:4]-[chunkhash:3]-[hash:5]',
        {
          hash: '0123456789',
          contentHash: 'f00dbabe',
          chunk: { name: 'component', id: 0, hash: 'abcdef' },
        }
      ),
    ],
    mode: this.mode,
  })}`
}
