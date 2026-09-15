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

// Test-only. `index.js` inspects this module's *locals* module directly (see the comment there),
// whose export keys are mangled. `__webpack_exports_info__` is the only way to learn which key an
// original export name ended up under: it is keyed by the original names and reports each one's
// emitted key as `mangledName`. Evaluated here rather than in `index.js` because it always
// describes the exports of the module it appears in.
export const exportsInfo = __webpack_exports_info__
