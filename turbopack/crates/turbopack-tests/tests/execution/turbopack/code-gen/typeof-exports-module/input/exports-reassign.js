exports = () => 'hello'
if (typeof exports === 'object') {
  throw new Error("exports-reassign: it's an object, so incorrectly inlined")
}
module.exports = 1234
