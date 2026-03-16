import { x } from './other/module-unused'

class NativeClass {
  static f() {
    return 42
  }
}

var TranspiledClass = /*#__PURE__*/ (function () {
  x()
  function C() {}
  C.f = function () {
    return 42
  }
  return C
})()

export { NativeClass, TranspiledClass }
