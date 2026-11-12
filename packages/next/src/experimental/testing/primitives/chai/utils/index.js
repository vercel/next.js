/*!
 * chai
 * Copyright(c) 2011 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

// Dependencies that are used for multiple exports are required here only once
import * as checkErrorFunctions from '../internal/check-error/index.js'
import { createExportObject } from '../export-object.js'

const checkError = createExportObject(checkErrorFunctions)

// test utility
export { test } from './test.js'

// type utility
import { type } from './type-detect.js'
export { type }

// expectTypes utility
export { expectTypes } from './expectTypes.js'

// message utility
export { getMessage } from './getMessage.js'

// actual utility
export { getActual } from './getActual.js'

// Inspect util
export { inspect } from './inspect.js'

// Object Display util
export { objDisplay } from './objDisplay.js'

// Flag utility
export { flag } from './flag.js'

// Flag transferring utility
export { transferFlags } from './transferFlags.js'

// Deep equal utility
export { default as eql } from '../internal/deep-eql/index.js'

// Deep path info
export { getPathInfo, hasProperty } from '../internal/pathval/index.js'

export function getName(fn) {
  return fn.name
}

// add Property
export { addProperty } from './addProperty.js'

// add Method
export { addMethod } from './addMethod.js'

// overwrite Property
export { overwriteProperty } from './overwriteProperty.js'

// overwrite Method
export { overwriteMethod } from './overwriteMethod.js'

// Add a chainable method
export { addChainableMethod } from './addChainableMethod.js'

// Overwrite chainable method
export { overwriteChainableMethod } from './overwriteChainableMethod.js'

// Compare by inspect method
export { compareByInspect } from './compareByInspect.js'

// Get own enumerable property symbols method
export { getOwnEnumerablePropertySymbols } from './getOwnEnumerablePropertySymbols.js'

// Get own enumerable properties method
export { getOwnEnumerableProperties } from './getOwnEnumerableProperties.js'

// Checks error against a given set of criteria
export { checkError }

// Proxify util
export { proxify } from './proxify.js'

// addLengthGuard util
export { addLengthGuard } from './addLengthGuard.js'

// isProxyEnabled helper
export { isProxyEnabled } from './isProxyEnabled.js'

// isNaN method
export { isNaN } from './isNaN.js'

// getOperator method
export { getOperator } from './getOperator.js'

// events EventTarget
export { events } from './events.js'

export function isRegExp(obj) {
  return Object.prototype.toString.call(obj) === '[object RegExp]'
}

export function isNumeric(obj) {
  return ['Number', 'BigInt'].includes(type(obj))
}
