import { config } from '../config.js'

/*!
 * Chai - isProxyEnabled helper
 * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

export function isProxyEnabled() {
  return (
    config.useProxy &&
    typeof Proxy !== 'undefined' &&
    typeof Reflect !== 'undefined'
  )
}
