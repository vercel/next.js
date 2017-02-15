/**
 * IMPORTANT: This module is compiled *without* `use strict`
 * so that when we `eval` a dependency below, we don't enforce
 * `use strict` implicitly.
 *
 * Otherwise, modules like `d3` get `eval`d and forced into
 * `use strict` where they don't work (at least in current versions)
 *
 * To see the compilation details, look at `flyfile.js` and the
 * usage of `babel-plugin-transform-remove-strict-mode`.
 */

export default function evalScript (script) {
  const module = { exports: {} }

  eval(script) // eslint-disable-line no-eval
  return module.exports
}
