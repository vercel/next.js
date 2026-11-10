import { mixin5 } from './dep2'

class Bar extends /*#__PURE__*/ mixin5(null) {
  static displayName = 'Point'
}

function test() {
  return Bar.displayName
}
