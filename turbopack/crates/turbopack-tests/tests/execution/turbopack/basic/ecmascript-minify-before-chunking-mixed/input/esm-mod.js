export const esmValue = (function () {
  const computed = 1 + 1
  return computed
})()

// ES modules are always strict: `this` is undefined in a plain function call.
export const esmIsStrict = (function () {
  return this === undefined
})()
