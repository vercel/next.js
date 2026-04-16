import { x } from './library/x.js'

function bar() {
  return x()
}

export { bar as used }
