// An ES module is strict, so `this` in a plain function call is undefined.
export const strict = (function () {
  return this
})()
export { default as sloppy } from './sloppy.js'
