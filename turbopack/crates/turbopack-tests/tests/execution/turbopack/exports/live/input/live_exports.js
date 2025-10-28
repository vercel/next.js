let foo = 'foo'

function setFoo(n) {
  foo = n
}
let neverMutated = 'neverMutated'
const obviouslyneverMutated = 'obviouslyneverMutated'
export { foo, setFoo, neverMutated, obviouslyneverMutated }

// biome-ignore lint/suspicious/noFunctionAssign: testing crimes
export function bar() {
  return 'bar'
}

export function setBar(b) {
  bar = b
}

export { globalThis as g }

export default function defaultFunction() {
  return 'defaultFunction'
}

export function setDefaultFunction(f) {
  defaultFunction = f
}
