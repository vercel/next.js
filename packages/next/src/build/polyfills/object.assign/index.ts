var assign = Object.assign.bind(Object)
function g() {
  return assign
}
Object.defineProperties(g(), {
  implementation: { get: g },
  shim: { value: g },
  getPolyfill: { value: g },
})
module.exports = g()
