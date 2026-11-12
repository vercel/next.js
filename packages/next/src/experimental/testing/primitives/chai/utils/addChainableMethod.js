/*!
 * Chai - addChainingMethod utility
 * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

import { Assertion } from '../assertion.js'
import {
  createAssertionIdentity,
  registerAssertionIdentity,
} from '../assertion-identity.js'
import { PluginEvent, events } from './events.js'
import { addLengthGuard } from './addLengthGuard.js'
import { flag } from './flag.js'
import { proxify } from './proxify.js'
import { transferFlags } from './transferFlags.js'

/**
 * @typedef {Object} ChainableBehavior
 * @property {() => void} chainingBehavior
 * @property {(...args: never) => unknown} method
 */

// Check whether `Object.setPrototypeOf` is supported
let canSetPrototype = typeof Object.setPrototypeOf === 'function'

// Without `Object.setPrototypeOf` support, this module will need to add properties to a function.
// However, some of functions' own props are not configurable and should be skipped.
let testFn = function () {}
let excludeNames = Object.getOwnPropertyNames(testFn).filter(function (name) {
  let propDesc = Object.getOwnPropertyDescriptor(testFn, name)

  // Note: PhantomJS 1.x includes `callee` as one of `testFn`'s own properties,
  // but then returns `undefined` as the property descriptor for `callee`. As a
  // workaround, we perform an otherwise unnecessary type-check for `propDesc`,
  // and then filter it out if it's not an object as it should be.
  if (typeof propDesc !== 'object') return true

  return !propDesc.configurable
})

// Cache `Function` properties
let call = Function.prototype.call,
  apply = Function.prototype.apply

export class PluginAddChainableMethodEvent extends PluginEvent {
  constructor(type, name, fn, chainingBehavior) {
    super(type, name, fn)
    this.chainingBehavior = chainingBehavior
  }
}

export function addChainableMethod(ctx, name, method, chainingBehavior) {
  const ctxChainable =
    /** @type {T & {__methods: Record<PropertyKey, ChainableBehavior>}} */ (ctx)

  if (typeof chainingBehavior !== 'function') {
    chainingBehavior = function () {}
  }

  /** @type {ChainableBehavior} */
  let chainableBehavior = {
    method: method,
    chainingBehavior: chainingBehavior,
  }

  // save the methods so we can overwrite them later, if we need to.
  if (!ctxChainable.__methods) {
    ctxChainable.__methods = {}
  }
  ctxChainable.__methods[name] = chainableBehavior

  Object.defineProperty(ctx, name, {
    get: function chainableMethodGetter() {
      chainableBehavior.chainingBehavior.call(this)

      function chainableMethodWrapper(...args) {
        // Setting the `ssfi` flag to `chainableMethodWrapper` causes this
        // function to be the starting point for removing implementation
        // frames from the stack trace of a failed assertion.
        //
        // However, we only want to use this function as the starting point if
        // the `lockSsfi` flag isn't set.
        //
        // If the `lockSsfi` flag is set, then this assertion is being
        // invoked from inside of another assertion. In this case, the `ssfi`
        // flag has already been set by the outer assertion.
        //
        // Note that overwriting a chainable method merely replaces the saved
        // methods in `ctx.__methods` instead of completely replacing the
        // overwritten assertion. Therefore, an overwriting assertion won't
        // set the `ssfi` or `lockSsfi` flags.
        if (!flag(this, 'lockSsfi')) {
          flag(this, 'ssfi', chainableMethodWrapper)
        }

        let result = /** @type {(...args: unknown[]) => unknown} */ (
          chainableBehavior.method
        ).apply(this, args)
        if (result !== undefined) {
          return result
        }

        let newAssertion = new Assertion()
        transferFlags(this, newAssertion)
        return newAssertion
      }

      addLengthGuard(chainableMethodWrapper, name, true)

      // Use `Object.setPrototypeOf` if available
      if (canSetPrototype) {
        // Inherit all properties from the object by replacing the `Function` prototype
        let prototype = Object.create(this)
        // Restore the `call` and `apply` methods from `Function`
        prototype.call = call
        prototype.apply = apply
        Object.setPrototypeOf(chainableMethodWrapper, prototype)
      }
      // Otherwise, redefine all properties (slow!)
      else {
        let asserterNames = Object.getOwnPropertyNames(ctx)
        asserterNames.forEach(function (asserterName) {
          if (excludeNames.indexOf(asserterName) !== -1) {
            return
          }

          let pd = Object.getOwnPropertyDescriptor(ctx, asserterName)
          if (pd) {
            Object.defineProperty(chainableMethodWrapper, asserterName, pd)
          }
        })
      }

      registerAssertionIdentity(
        chainableMethodWrapper,
        createAssertionIdentity()
      )
      transferFlags(this, chainableMethodWrapper)
      return proxify(chainableMethodWrapper)
    },
    configurable: true,
  })

  events.dispatchEvent(
    new PluginAddChainableMethodEvent(
      'addChainableMethod',
      name,
      method,
      chainingBehavior
    )
  )
}
