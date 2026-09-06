// Discarded by the literal below, so not an export.
exports.early = 'early-value'

module.exports = {
  used: 'used-value',
  unused: 'unused-value',
}

// Not exports: `exports` and top-level `this` hold the object the literal discarded.
exports.deadExports = 'dead-exports'
this.deadThis = 'dead-this'
Object.defineProperty(exports, 'deadDefined', { value: 'dead-defined' })

// Exports: `module.exports` is the live object.
module.exports.usedLate = 'used-late'
module.exports.unusedLate = 'unused-late'
