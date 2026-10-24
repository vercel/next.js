// An ES module is strict, so `this` in a plain function call is undefined.
export const strictA = (function () {
  return this
})()
