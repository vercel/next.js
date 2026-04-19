export { test } from './external'
import * as c from './module'
export { c }
import * as cc from './module'
export { cc }
export * from './module'
export default 'd'
export const e = 'e'
export var e_var = 'e'
export function a() {
  return 'a'
}
export function aa() {
  return 'aa'
}
