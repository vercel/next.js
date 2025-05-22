import { a as b, test } from './file1'

var c = {
  a: function a() {
    return b()
  },
}

var d = {
  x: function x() {
    function a() {
      return 'fail'
    }
    return b()
  },
}

export { c, d, test }
