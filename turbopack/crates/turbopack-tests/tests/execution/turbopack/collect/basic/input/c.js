import { unusedHelper } from './c-unused'

export function c() {
  return 'this is c.js'
}

export function unused() {
  return unusedHelper()
}
