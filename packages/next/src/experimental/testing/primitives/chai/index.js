/*!
 * chai
 * Copyright(c) 2011-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

import * as utilities from './utils/index.js'
import { createExportObject } from './export-object.js'
import { AssertionError } from './internal/assertion-error/index.js'
import { config } from './config.js'
import './core/assertions.js'
import { expect } from './interface/expect.js'
import { Assertion } from './assertion.js'
import { should, Should } from './interface/should.js'
import { assert } from './interface/assert.js'

const util = createExportObject(utilities)

/**
 * @typedef {object} ChaiExports
 * @property {typeof use} use The use function
 * @property {typeof AssertionError} AssertionError AssertionError constructor
 * @property {typeof util} util Utility functions
 * @property {typeof config} config Configuration object
 * @property {typeof expect} expect Expect interface
 * @property {typeof assert} assert Assert interface
 * @property {typeof Assertion} Assertion Assertion constructor
 * @property {typeof should} should Should interface
 * @property {typeof Should} Should Should interface
 */

/**
 * @typedef {(chai: ChaiExports, utils: typeof util) => void} ChaiPlugin
 */

/** @type {ChaiPlugin[]} */
const used = []

// Assertion Error
export { AssertionError }

export function use(fn) {
  const exports = {
    use,
    AssertionError,
    util,
    config,
    expect,
    assert,
    Assertion,
    Should,
    should,
  }

  if (!~used.indexOf(fn)) {
    fn(exports, util)
    used.push(fn)
  }

  return exports
}

// Utility Functions
export { util }

// Configuration
export { config }

// Primary `Assertion` prototype
export * from './assertion.js'

// Expect interface
export * from './interface/expect.js'

// Should interface
export * from './interface/should.js'

// Assert interface
export * from './interface/assert.js'

export {
  getChaiAssertionIdentity,
  getChaiAssertionTransferSourceIdentity,
  hasChaiAssertionTaskFlagTransfer,
} from './assertion-identity.js'
