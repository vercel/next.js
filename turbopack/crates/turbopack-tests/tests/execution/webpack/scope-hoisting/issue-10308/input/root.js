import CommonJs from './commonjs'
import { test } from './external'

function fn() {
  CommonJs

  var external = 40

  var externalValue = test(external)

  return externalValue
}

export { fn }
