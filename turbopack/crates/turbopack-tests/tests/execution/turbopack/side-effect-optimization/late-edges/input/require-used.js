import { value } from './pure-dep.js'

export function loadRequire() {
  return require('./require-effect.cjs')
}

export const derived = value + 1
