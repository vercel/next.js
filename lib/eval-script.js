import React from 'react'
import ReactDOM from 'react-dom'
import App from '../lib/app'
import Link from '../lib/link'
import * as Css from '../lib/css'
import Head from '../lib/head'

const modules = new Map([
  ['react', React],
  ['react-dom', ReactDOM],
  ['next/app', App],
  ['next/link', Link],
  ['next/css', Css],
  ['next/head', Head]
])

/**
 * IMPORTANT: This module is compiled *without* `use strict`
 * so that when we `eval` a dependency below, we don't enforce
 * `use strict` implicitly.
 *
 * Otherwise, modules like `d3` get `eval`d and forced into
 * `use strict` where they don't work (at least in current versions)
 *
 * To see the compilation details, look at `gulpfile.js` and the
 * usage of `babel-plugin-transform-remove-strict-mode`.
 */

export default function evalScript (script) {
  const module = { exports: {} }
  const require = function (path) { // eslint-disable-line no-unused-vars
    return modules.get(path)
  }
  // don't use Function() here since it changes source locations
  eval(script) // eslint-disable-line no-eval
  return module.exports
}
