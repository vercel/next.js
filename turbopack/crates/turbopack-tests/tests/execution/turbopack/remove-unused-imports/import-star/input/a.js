import * as lib from './library/index.js'

lib.y()

function helper() {
  return lib.x()
}

export function unused() {
  return helper()
}

export function used() {
  return 1234
}
