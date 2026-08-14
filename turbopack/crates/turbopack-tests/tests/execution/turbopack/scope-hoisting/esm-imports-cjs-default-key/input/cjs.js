// A CommonJS module with a `default` key but no `__esModule` marker: the ESM
// default import must receive the whole `module.exports`, not `exports.default`.
module.exports = {
  default: 'the-default',
  named: 'the-named',
}
