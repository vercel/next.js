// `package.json` declares this module free of side effects. The push only makes its evaluation
// visible to the test.
;(globalThis.__evaluatedModules ??= []).push('side-effect-free')

export function sideEffectFree() {
  return 'side-effect-free'
}
