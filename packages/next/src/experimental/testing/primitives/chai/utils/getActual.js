/*!
 * Chai - getActual utility
 * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

/**
 * @typedef {import("../assertion.js").Assertion} Assertion
 */

export function getActual(obj, args) {
  return args.length > 4 ? args[4] : obj._obj
}
