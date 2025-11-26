import { x } from './library/x.js'
import { y } from './library/y.js'

y()

function helper() {
  return x()
}

export function unused() {
  return helper()
}

export function used() {
  return 1234
}
