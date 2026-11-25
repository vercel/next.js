module = () => 'hello'
if (typeof module === 'object') {
  throw new Error("module-reassign: it's an object, so incorrectly inlined")
}
exports.foo = 1234
