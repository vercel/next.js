/* eslint-env jest */

import { join } from 'path'

import { runDevSuite, runProdSuite } from 'next-test-utils'
import basics from './basics'

const appDir = join(__dirname, '../app')

describe('Basics', () => {
  runTests('react 18 with reactRoot set to false', basics)
})

function runTests(name, fn, opts) {
  const suiteOptions = { ...opts, runTests: fn }
  runDevSuite(name, appDir, suiteOptions)
  runProdSuite(name, appDir, suiteOptions)
}
