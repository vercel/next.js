let lastSet

// A get/set descriptor: the getter re-exports a required value, but the setter
// must be preserved (it cannot be reproduced by the reexport rewrite).
Object.defineProperty(exports, 'value', {
  get: () => require('./module').abc,
  set: (v) => {
    lastSet = v
  },
})

exports.getLastSet = () => lastSet
