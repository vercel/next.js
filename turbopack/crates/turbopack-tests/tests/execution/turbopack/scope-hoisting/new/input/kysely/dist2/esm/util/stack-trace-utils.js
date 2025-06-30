/// <reference types="./stack-trace-utils.d.ts" />
import { isObject, isString } from './object-utils.js'
export function extendStackTrace(err, stackError) {
  if (isStackHolder(err) && stackError.stack) {
    // Remove the first line that just says `Error`.
    const stackExtension = stackError.stack.split('\n').slice(1).join('\n')
    err.stack += `\n${stackExtension}`
    return err
  }
  return err
}
function isStackHolder(obj) {
  return isObject(obj) && isString(obj.stack)
}
