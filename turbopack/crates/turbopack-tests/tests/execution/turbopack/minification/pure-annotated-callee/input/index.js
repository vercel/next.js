import { __name } from './name.js'

const calls = []

function make() {
  return {
    run() {
      calls.push('member')
    },
  }
}

// The PURE annotations below apply only to the inner, parenthesized calls. The
// outer calls have side effects and must not be removed by the minifier.
;(/* @__PURE__ */ __name(function annotated() {
  calls.push('iife')
}, 'annotated'))()
;(/* @__PURE__ */ make()).run()

it('should keep calls whose callee is a PURE-annotated call', () => {
  expect(calls).toEqual(['iife', 'member'])
})
