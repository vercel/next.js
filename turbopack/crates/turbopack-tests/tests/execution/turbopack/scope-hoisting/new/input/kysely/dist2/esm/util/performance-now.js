/// <reference types="./performance-now.d.ts" />
import { isFunction } from './object-utils.js'
export function performanceNow() {
  if (typeof performance !== 'undefined' && isFunction(performance.now)) {
    return performance.now()
  } else {
    return Date.now()
  }
}
