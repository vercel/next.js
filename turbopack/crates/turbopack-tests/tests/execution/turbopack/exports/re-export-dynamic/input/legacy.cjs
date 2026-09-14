module.exports.LEGACY_CONST = 'I am dynamic'
module.exports.AnotherThing = function () {
  return 'still dynamic'
}

// An export whose value can be reassigned by the CJS module itself at runtime.
module.exports.mutableValue = 'before'
module.exports.setMutable = function (value) {
  module.exports.mutableValue = value
}
