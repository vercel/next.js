/*!
 * Chai - flag utility
 * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

/**
 * Known flag names mapped to the value type they always hold.
 *
 * @typedef {{
 *   ssfi: Function,
 *   message: string,
 *   object: unknown,
 *   negate: boolean,
 * }} FlagMap
 * @private
 */

export function flag(obj, key, value) {
  let flags = obj.__flags || (obj.__flags = Object.create(null))
  if (arguments.length === 3) {
    flags[key] = value
  } else {
    return flags[key]
  }
}
