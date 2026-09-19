import { value } from './pure-dep.js'

export function load() {
  return require('./require-effect.cjs')
}

export const derived = value + 1
