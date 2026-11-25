import * as iso from './iso.js'
import { RealError } from './errors.js'

globalThis.__evaluations = (globalThis.__evaluations ?? 0) + 1
export const instance = { evaluation: globalThis.__evaluations }
export function instanceFromClosure() {
  return instance
}

RealError
iso.datetime()

export const anyBase = 1234
export function any() {
  return anyBase
}
