/*!
 * Chai - overwriteChainableMethod utility
 * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

import { Assertion } from '../assertion.js'
import { transferFlags } from './transferFlags.js'

/**
 * @typedef {Object} ChainableBehavior
 * @property {() => void} chainingBehavior
 * @property {(...args: never) => unknown} method
 */

export function overwriteChainableMethod(ctx, name, method, chainingBehavior) {
  let chainableBehavior =
    /** @type {{__methods: Record<PropertyKey, ChainableBehavior>}} */ (ctx)
      .__methods[name]

  let _chainingBehavior = chainableBehavior.chainingBehavior
  chainableBehavior.chainingBehavior =
    function overwritingChainableMethodGetter() {
      let result = chainingBehavior(_chainingBehavior).call(this)
      if (result !== undefined) {
        return result
      }

      let newAssertion = new Assertion()
      transferFlags(this, newAssertion)
      return newAssertion
    }

  let _method = chainableBehavior.method

  chainableBehavior.method = function overwritingChainableMethodWrapper() {
    let result = method(_method).apply(this, arguments)
    if (result !== undefined) {
      return result
    }

    let newAssertion = new Assertion()
    transferFlags(this, newAssertion)
    return newAssertion
  }
}
