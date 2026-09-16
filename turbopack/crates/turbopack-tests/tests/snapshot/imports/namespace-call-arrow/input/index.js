import * as ns from './lib.js'

console.log(
  ns.arrowFn(1),
  ns.plainFn(2),
  ns.methodLike(),
  ns.evalFn(),
  ns.classFn()
)
