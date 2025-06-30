/// <reference types="./compilable.d.ts" />
import { isFunction, isObject } from './object-utils.js'
export function isCompilable(value) {
  return isObject(value) && isFunction(value.compile)
}
