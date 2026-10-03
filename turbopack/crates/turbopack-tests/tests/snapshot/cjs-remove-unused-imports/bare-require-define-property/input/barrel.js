// The shape a transpiler emits for `export { a } from './barrel-target.js'`.
Object.defineProperty(exports, '__esModule', { value: true })
var _target = require('./barrel-target.js')
Object.defineProperty(exports, 'a', {
  enumerable: true,
  get: function () {
    return _target.a
  },
})
